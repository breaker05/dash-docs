import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { searchPages } from "@/server/search";
import {
  searchContextChunks,
  searchContextChunksByVector,
} from "@/server/context-docs";
import { getEmbeddingProvider } from "@/server/embeddings";
import { reciprocalRankFusion } from "@/lib/rrf";
import { getAskConfig } from "@/server/settings";
import {
  buildAskPrompt,
  buildOrQuery,
  trimHistory,
  type AskSource,
} from "@/lib/ask-prompt";
import {
  checkRateLimit,
  rateLimitedResponse,
  requestIp,
} from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5";

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
  const { apiKey, enabled } = await getAskConfig(db);
  if (!apiKey || !enabled) {
    return Response.json({ error: "Ask is not available" }, { status: 503 });
  }

  const session = await auth();
  const limit = await checkRateLimit(db, {
    key: `ask:ip:${requestIp(request)}`,
    limit: session?.user ? 30 : 10,
    windowSeconds: 60,
  });
  if (!limit.allowed) return rateLimitedResponse(limit);

  let body: {
    question?: string;
    history?: { role: "user" | "assistant"; content: string }[];
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

  // retrieval: precise (AND) search first; when conversational phrasing
  // leaves it thin, fill from a recall-mode (OR) search — ranking puts
  // title matches first
  const includeInternal = Boolean(session?.user);
  const hits = await searchPages(db, {
    query: question,
    includeInternal,
    limit: 5,
  });
  if (hits.length < 3) {
    const orQuery = buildOrQuery(question);
    if (orQuery !== "") {
      const seen = new Set(hits.map((h) => h.id));
      const broad = await searchPages(db, {
        query: orQuery,
        includeInternal,
        limit: 5,
      });
      for (const hit of broad) {
        if (hits.length >= 5) break;
        if (!seen.has(hit.id)) hits.push(hit);
      }
    }
  }
  const rows =
    hits.length === 0
      ? []
      : await db
          .select({
            id: pages.id,
            title: pages.publishedTitle,
            path: pages.path,
            markdown: pages.publishedContentMd,
          })
          .from(pages)
          .where(
            and(
              inArray(
                pages.id,
                hits.map((h) => h.id),
              ),
              isNotNull(pages.publishedContentMd),
              includeInternal
                ? isNotNull(pages.publishedContentMd)
                : eq(pages.effectiveVisibility, "public"),
            ),
          );
  // keep search's relevance order; reference-file chunks fill after pages
  // (same precise-then-recall fallback as pages — conversational phrasing
  // rarely AND-matches inside a spec file)
  const byId = new Map(rows.map((r) => [r.id, r]));
  let chunkHits = await searchContextChunks(db, {
    query: question,
    includeInternal,
    limit: FILE_CHUNK_SLOTS,
  });
  if (chunkHits.length === 0) {
    const orQuery = buildOrQuery(question);
    if (orQuery !== "") {
      chunkHits = await searchContextChunks(db, {
        query: orQuery,
        includeInternal,
        limit: FILE_CHUNK_SLOTS,
      });
    }
  }
  // Semantic pass (additive): when an embedding provider is configured, blend
  // vector-similarity hits with the keyword hits via reciprocal rank fusion so
  // conceptually-matching chunks surface even when they share no keywords. No
  // provider wired yet → this is skipped and retrieval stays keyword-only.
  const embedder = getEmbeddingProvider();
  if (embedder) {
    const [queryVec] = await embedder.embed([question]);
    if (queryVec) {
      const vectorHits = await searchContextChunksByVector(db, {
        embedding: queryVec,
        includeInternal,
        limit: FILE_CHUNK_SLOTS,
      });
      chunkHits = reciprocalRankFusion(
        [chunkHits, vectorHits],
        (c) => `${c.docId}:${c.ord}`,
      ).slice(0, FILE_CHUNK_SLOTS);
    }
  }
  // Reserve slots for each source kind so a large reference file (many
  // matching chunks) is never crowded out by page hits, and vice versa.
  const pageSources: AskSource[] = hits
    .map((h) => byId.get(h.id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .slice(0, PAGE_SLOTS)
    .map((r) => ({
      n: 0,
      title: r.title ?? "Untitled",
      path: r.path,
      markdown: r.markdown ?? "",
      kind: "page" as const,
    }));
  const fileSources: AskSource[] = chunkHits.slice(0, FILE_CHUNK_SLOTS).map((c) => ({
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

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: unknown) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const messageStream = client.messages.stream({
          model: MODEL,
          max_tokens: 1024,
          system: buildAskPrompt(sources),
          messages: [
            ...trimHistory(body.history ?? []),
            { role: "user", content: question },
          ],
        });
        for await (const event of messageStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            send(controller, { type: "delta", text: event.delta.text });
          }
        }
        send(controller, {
          type: "sources",
          sources: sources.map((s) => ({
            n: s.n,
            title: s.title,
            path: s.path,
            kind: s.kind,
          })),
        });
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
