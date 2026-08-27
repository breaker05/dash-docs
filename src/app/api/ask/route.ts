import Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { searchPages } from "@/server/search";
import { getAnthropicApiKey } from "@/server/settings";
import { buildAskPrompt, trimHistory, type AskSource } from "@/lib/ask-prompt";
import {
  checkRateLimit,
  rateLimitedResponse,
  requestIp,
} from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5";

/**
 * "Ask the docs": retrieval-grounded Q&A over published pages. Signed-in
 * team members transparently get internal pages in retrieval; anonymous
 * visitors get public pages only. Streams SSE: {type:"delta"} text chunks,
 * one {type:"sources"} event, then [DONE].
 */
export async function POST(request: Request) {
  const apiKey = await getAnthropicApiKey(db);
  if (!apiKey) {
    return Response.json({ error: "Ask is not configured" }, { status: 503 });
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

  // retrieval: top search hits, then their full published markdown
  const includeInternal = Boolean(session?.user);
  const hits = await searchPages(db, {
    query: question,
    includeInternal,
    limit: 5,
  });
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
  // keep search's relevance order
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sources: AskSource[] = hits
    .map((h) => byId.get(h.id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r, i) => ({
      n: i + 1,
      title: r.title ?? "Untitled",
      path: r.path,
      markdown: r.markdown ?? "",
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
