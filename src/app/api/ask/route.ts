import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  searchContextChunks,
  searchContextChunksByVector,
} from "@/server/context-docs";
import {
  searchPageChunks,
  searchPageChunksByVector,
} from "@/server/pages/chunks";
import { getPublishedCorpus } from "@/server/pages/corpus";
import { getEmbeddingProvider } from "@/server/embeddings";
import { reciprocalRankFusion } from "@/lib/rrf";
import { getAskConfig } from "@/server/settings";
import {
  addMessage,
  conversationForRequest,
  createConversation,
  loadConversationHistory,
} from "@/server/conversations";
import {
  buildAskPrompt,
  buildOrQuery,
  citedSourceNumbers,
  trimHistory,
  type AskSource,
} from "@/lib/ask-prompt";
import { effectiveCorpusCharBudget } from "@/lib/ask-models";
import {
  checkRateLimit,
  rateLimitedResponse,
  requestIp,
} from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Retrieval budget per answer. File chunks get their own reserved slots so a
// large reference file (e.g. an API spec split into many chunks) is never
// squeezed out by page hits; pages likewise keep a floor.
const PAGE_SLOTS = 4;
const FILE_CHUNK_SLOTS = 8;

/**
 * "Ask the docs": retrieval-grounded Q&A over published pages. Signed-in
 * team members transparently get internal pages in retrieval; anonymous
 * visitors get public pages only. Streams SSE: {type:"delta"} text chunks,
 * one {type:"sources"} event, then [DONE].
 */
export async function POST(request: Request) {
  const { apiKey, enabled, model, effort, corpusTokenBudget } =
    await getAskConfig(db);
  if (!apiKey || !enabled) {
    return Response.json({ error: "Ask is not available" }, { status: 503 });
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const limit = await checkRateLimit(db, {
    key: `ask:ip:${requestIp(request)}`,
    limit: session?.user ? 30 : 10,
    windowSeconds: 60,
  });
  if (!limit.allowed) return rateLimitedResponse(limit);

  let body: {
    question?: string;
    conversationId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const question = body.question?.trim().slice(0, 1000) ?? "";
  if (question === "") {
    return Response.json({ error: "question is required" }, { status: 400 });
  }

  // Resolve the conversation: continue the one the client holds if it's the
  // caller's (or an anonymous one they created), otherwise start fresh. History
  // now lives server-side — the client no longer resends the transcript, which
  // is what keeps context (and cost) bounded across a session.
  const existing = body.conversationId
    ? await conversationForRequest(db, {
        conversationId: body.conversationId,
        userId,
      })
    : null;
  const priorHistory = existing
    ? await loadConversationHistory(db, existing.id)
    : [];

  const includeInternal = Boolean(session?.user);
  const orQuery = buildOrQuery(question);

  // Pages are the source of truth. When the whole published corpus fits in the
  // budget (the common case — a docs site is small), give the model EVERY page
  // and let it answer from all of them, cached so repeat questions are cheap.
  // No retrieval guessing, no embeddings, no external service. Only when the
  // corpus is too large do we fall back to keyword/section retrieval.
  const corpus = await getPublishedCorpus(db, { includeInternal });
  const corpusChars = corpus.reduce((n, p) => n + p.markdown.length, 0);
  const corpusBudget = effectiveCorpusCharBudget(model, corpusTokenBudget);
  const wholeCorpus = corpus.length > 0 && corpusChars <= corpusBudget;

  let pageChunkHits: Awaited<ReturnType<typeof searchPageChunks>> = [];
  if (!wholeCorpus) {
    pageChunkHits = await searchPageChunks(db, {
      query: question,
      includeInternal,
      limit: PAGE_SLOTS,
    });
    if (pageChunkHits.length === 0 && orQuery !== "") {
      pageChunkHits = await searchPageChunks(db, {
        query: orQuery,
        includeInternal,
        limit: PAGE_SLOTS,
      });
    }
  }

  // Uploaded reference files (API specs etc.) can be huge, so they stay
  // chunk-level regardless of corpus mode.
  let fileChunkHits = await searchContextChunks(db, {
    query: question,
    includeInternal,
    limit: FILE_CHUNK_SLOTS,
  });
  if (fileChunkHits.length === 0 && orQuery !== "") {
    fileChunkHits = await searchContextChunks(db, {
      query: orQuery,
      includeInternal,
      limit: FILE_CHUNK_SLOTS,
    });
  }

  // Optional semantic pass — only if an embedding provider is configured (it
  // isn't by default). Best-effort: a failure degrades to keyword hits.
  const embedder = getEmbeddingProvider();
  if (embedder) {
    try {
      const [queryVec] = await embedder.embed([question]);
      if (queryVec) {
        const fileVec = await searchContextChunksByVector(db, {
          embedding: queryVec,
          includeInternal,
          limit: FILE_CHUNK_SLOTS,
        });
        fileChunkHits = reciprocalRankFusion(
          [fileChunkHits, fileVec],
          (c) => `${c.docId}:${c.ord}`,
        ).slice(0, FILE_CHUNK_SLOTS);
        if (!wholeCorpus) {
          const pageVec = await searchPageChunksByVector(db, {
            embedding: queryVec,
            includeInternal,
            limit: PAGE_SLOTS,
          });
          pageChunkHits = reciprocalRankFusion(
            [pageChunkHits, pageVec],
            (c) => `${c.pageId}:${c.ord}`,
          ).slice(0, PAGE_SLOTS);
        }
      }
    } catch (err) {
      console.error("Ask AI semantic retrieval failed; keyword-only", err);
    }
  }

  const pageSources: AskSource[] = wholeCorpus
    ? corpus.map((p) => ({
        n: 0,
        title: p.title,
        path: p.path,
        markdown: p.markdown,
        kind: "page" as const,
      }))
    : pageChunkHits.slice(0, PAGE_SLOTS).map((c) => ({
        n: 0,
        title: c.title,
        path: c.path,
        markdown: c.content,
        kind: "page" as const,
      }));
  const fileSources: AskSource[] = fileChunkHits.slice(0, FILE_CHUNK_SLOTS).map((c) => ({
    n: 0,
    title: `${c.docName} (part ${c.ord + 1})`,
    path: "",
    markdown: c.content,
    kind: "file" as const,
  }));
  const sources: AskSource[] = [...pageSources, ...fileSources].map((s, i) => ({
    ...s,
    n: i + 1,
  }));

  // In whole-corpus mode, keep full page text and cache the (stable) prompt so
  // repeat questions only pay a fraction to re-read it.
  const systemPrompt = buildAskPrompt(sources, {
    maxSourceChars: wholeCorpus ? Infinity : undefined,
  });
  const system = wholeCorpus
    ? [
        {
          type: "text" as const,
          text: systemPrompt,
          cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
        },
      ]
    : systemPrompt;

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: unknown) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const sourceRefs = sources.map((s) => ({
    n: s.n,
    title: s.title,
    path: s.path,
    kind: s.kind,
  }));

  const stream = new ReadableStream({
    async start(controller) {
      // Ensure a conversation exists and record the user's question up front,
      // so the exchange is captured even if the model stream fails midway.
      let conversationId: string;
      try {
        conversationId =
          existing?.id ??
          (await createConversation(db, {
            userId,
            model: model.id,
            effort,
            includeInternal,
            firstQuestion: question,
          }));
        await addMessage(db, {
          conversationId,
          role: "user",
          content: question,
        });
      } catch {
        send(controller, { type: "error", message: "Something went wrong." });
        controller.close();
        return;
      }
      // Tell the client which conversation this is (drives history + follow-ups).
      send(controller, { type: "meta", conversationId });

      let answer = "";
      try {
        const messageStream = client.messages.stream({
          model: model.id,
          // Adaptive thinking spends part of the budget on reasoning, so give
          // the answer headroom; without thinking a short chat reply is plenty.
          max_tokens: model.adaptiveThinking ? 4096 : 1024,
          // Adaptive thinking lifts answer quality on harder questions; the
          // admin-configured effort tunes how much it reasons. Haiku 4.5
          // doesn't support these params (they'd 400), so it runs without.
          ...(model.adaptiveThinking
            ? {
                thinking: { type: "adaptive" as const },
                output_config: { effort },
              }
            : {}),
          system,
          messages: [
            ...trimHistory(priorHistory),
            { role: "user", content: question },
          ],
        });
        for await (const event of messageStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            answer += event.delta.text;
            send(controller, { type: "delta", text: event.delta.text });
          }
        }
        // Show only the sources the model actually cited — in whole-corpus mode
        // every page is supplied, so surfacing them all would be noise.
        const cited = citedSourceNumbers(answer);
        const citedSources = sourceRefs.filter((s) => cited.has(s.n));
        send(controller, { type: "sources", sources: citedSources });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        send(controller, {
          type: "error",
          message:
            e instanceof Anthropic.APIError
              ? "The assistant is temporarily unavailable — try again shortly."
              : "Something went wrong.",
        });
      } finally {
        // Persist whatever answer we produced (with the sources it cited) so
        // the transcript is complete for history and admin review.
        if (answer.trim() !== "") {
          const cited = citedSourceNumbers(answer);
          await addMessage(db, {
            conversationId,
            role: "assistant",
            content: answer,
            sources: sourceRefs.filter((s) => cited.has(s.n)),
          }).catch(() => {});
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
