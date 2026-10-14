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
import { costOfUsage, effectiveCorpusCharBudget } from "@/lib/ask-models";
import { buildChatToolkit, mcpCallsFromContent } from "@/server/chat-tools";
import {
  loadChatIntegrations,
  markIntegrationsUsed,
} from "@/server/integrations";
import type { MessageToolCall } from "@/db/schema";
import {
  checkRateLimit,
  rateLimitedResponse,
  requestIp,
} from "@/server/rate-limit";

export const runtime = "nodejs";
// live-data lookups add model round-trips, so allow more than a plain answer
export const maxDuration = 120;

// Retrieval budget per answer. File chunks get their own reserved slots so a
// large reference file (e.g. an API spec split into many chunks) is never
// squeezed out by page hits; pages likewise keep a floor.
const PAGE_SLOTS = 4;
const FILE_CHUNK_SLOTS = 8;
// Cap on model round-trips per answer when live-data tools are in play
// (schema lookup → query → refine is typically 2–4).
const MAX_TOOL_STEPS = 8;
// Lets the API re-run a safety-declined answer on the model Anthropic
// recommends for that decline category, inside the same request.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * "Ask the docs": retrieval-grounded Q&A over published pages. Signed-in
 * team members transparently get internal pages in retrieval; anonymous
 * visitors get public pages only. Team members also get the enabled
 * integrations (read-only SQL, MCP servers) as tools. Streams SSE:
 * {type:"delta"} text chunks, {type:"status"} while a tool runs, one
 * {type:"sources"} event, then [DONE].
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
  // Live data sources are for the signed-in team only — never anonymous.
  const toolkit = includeInternal
    ? buildChatToolkit(await loadChatIntegrations(db))
    : null;
  const system = [
    {
      type: "text" as const,
      text: systemPrompt,
      ...(wholeCorpus
        ? { cache_control: { type: "ephemeral" as const, ttl: "1h" as const } }
        : {}),
    },
    // after the cached corpus block so it never invalidates that prefix
    ...(toolkit ? [{ type: "text" as const, text: toolkit.promptSection }] : []),
  ];

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
      let usage:
        | { input: number; output: number; cacheRead: number; cacheWrite: number }
        | undefined;
      // priced per request: the long-prompt rate card and a fallback model's
      // rates both apply request by request, not to the summed usage
      let costUsd = 0;
      const toolCalls: MessageToolCall[] = [];
      const usedIntegrations = new Set<string>();
      try {
        const convo: Anthropic.Beta.Messages.BetaMessageParam[] = [
          ...trimHistory(priorHistory),
          { role: "user", content: question },
        ];
        const addUsage = (
          u: Anthropic.Beta.Messages.BetaUsage,
          servedBy: string,
        ) => {
          const step = {
            input: u.input_tokens ?? 0,
            output: u.output_tokens ?? 0,
            cacheRead: u.cache_read_input_tokens ?? 0,
            cacheWrite: u.cache_creation_input_tokens ?? 0,
          };
          usage ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
          usage.input += step.input;
          usage.output += step.output;
          usage.cacheRead += step.cacheRead;
          usage.cacheWrite += step.cacheWrite;
          costUsd += costOfUsage(model, step, servedBy);
        };
        const betas = [
          ...(model.serverFallback ? [FALLBACK_BETA] : []),
          ...(toolkit?.betas ?? []),
        ];
        for (let step = 0; ; step++) {
          // keep text from successive round-trips from running together
          if (answer !== "" && !/\s$/.test(answer)) {
            answer += "\n\n";
            send(controller, { type: "delta", text: "\n\n" });
          }
          const messageStream = client.beta.messages.stream({
            model: model.id,
            // Adaptive thinking spends part of the budget on reasoning, so give
            // the answer headroom; without thinking a short chat reply is
            // plenty — unless tools are in play, whose results get summarized.
            max_tokens: model.adaptiveThinking ? (toolkit ? 8192 : 4096) : toolkit ? 2048 : 1024,
            // Adaptive thinking lifts answer quality on harder questions; the
            // admin-configured effort tunes how much it reasons. Haiku 4.5
            // doesn't support these params (they'd 400), so it runs without.
            ...(model.adaptiveThinking
              ? {
                  thinking: { type: "adaptive" as const },
                  output_config: { effort },
                }
              : {}),
            ...(toolkit
              ? {
                  tools: toolkit.tools,
                  ...(toolkit.mcpServers.length > 0
                    ? { mcp_servers: toolkit.mcpServers }
                    : {}),
                }
              : {}),
            ...(model.serverFallback ? { fallbacks: "default" as const } : {}),
            ...(betas.length > 0 ? { betas } : {}),
            system,
            messages: convo,
          });
          for await (const event of messageStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              answer += event.delta.text;
              send(controller, { type: "delta", text: event.delta.text });
            } else if (
              event.type === "content_block_start" &&
              event.content_block.type === "mcp_tool_use"
            ) {
              send(controller, {
                type: "status",
                text: `Checking ${event.content_block.server_name}…`,
              });
            }
          }
          // Capture token usage for cost accounting (input, output, and the
          // cache read/write that dominate whole-corpus cost), summed across
          // tool round-trips.
          const final = await messageStream.finalMessage();
          // final.model names the fallback model when one took over
          addUsage(final.usage, final.model);
          toolCalls.push(...mcpCallsFromContent(final.content));

          if (
            toolkit &&
            (final.stop_reason === "tool_use" || final.stop_reason === "pause_turn") &&
            step < MAX_TOOL_STEPS
          ) {
            convo.push({ role: "assistant", content: final.content });
            if (final.stop_reason === "pause_turn") continue;
            const uses = final.content.filter(
              (b): b is Anthropic.Beta.Messages.BetaToolUseBlock =>
                b.type === "tool_use",
            );
            for (const u of uses) {
              send(controller, { type: "status", text: toolkit.describe(u.name) });
            }
            const results = await Promise.all(uses.map((u) => toolkit.execute(u)));
            for (const r of results) {
              toolCalls.push(r.call);
              if (r.integrationId) usedIntegrations.add(r.integrationId);
            }
            convo.push({ role: "user", content: results.map((r) => r.result) });
            continue;
          }
          if (final.stop_reason === "refusal") {
            // declined by the safety classifiers (and by any fallback model)
            console.warn(
              "Ask AI answer declined",
              final.stop_details?.category ?? "unknown",
            );
            const note =
              answer.trim() === ""
                ? "I can't help with that one — try rephrasing the question."
                : "\n\n_(This answer was cut short — try rephrasing the question.)_";
            answer += note;
            send(controller, { type: "delta", text: note });
          }
          if (final.stop_reason === "tool_use" && answer.trim() === "") {
            const note =
              "I couldn't finish looking that up in time — try asking a narrower question.";
            answer += note;
            send(controller, { type: "delta", text: note });
          }
          break;
        }
        // Show only the sources the model actually cited — in whole-corpus mode
        // every page is supplied, so surfacing them all would be noise.
        const cited = citedSourceNumbers(answer);
        const citedSources = sourceRefs.filter((s) => cited.has(s.n));
        send(controller, { type: "sources", sources: citedSources });
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        console.error("Ask AI answer failed", e);
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
            usage,
            costUsd: usage ? costUsd : undefined,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          }).catch(() => {});
        }
        await markIntegrationsUsed(db, [...usedIntegrations]).catch(() => {});
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
