import { and, eq, isNotNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { pageFeedback, pages } from "@/db/schema";
import {
  checkRateLimit,
  rateLimitedResponse,
  requestIp,
} from "@/server/rate-limit";

export const runtime = "nodejs";

/** Anonymous "was this helpful?" votes from public pages. */
export async function POST(request: Request) {
  const limit = await checkRateLimit(db, {
    key: `feedback:ip:${requestIp(request)}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!limit.allowed) return rateLimitedResponse(limit);

  let body: { pageId?: string; helpful?: boolean; comment?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.pageId !== "string" || typeof body.helpful !== "boolean") {
    return Response.json(
      { error: "pageId and helpful are required" },
      { status: 400 },
    );
  }
  const comment =
    typeof body.comment === "string" && body.comment.trim() !== ""
      ? body.comment.trim().slice(0, 2000)
      : null;

  const session = await auth();
  const visibility = session?.user
    ? isNotNull(pages.publishedContentMd)
    : and(
        isNotNull(pages.publishedContentMd),
        eq(pages.effectiveVisibility, "public"),
      );
  const [page] = await db
    .select({ id: pages.id, path: pages.path })
    .from(pages)
    .where(and(eq(pages.id, body.pageId), visibility));
  if (!page) return Response.json({ error: "Unknown page" }, { status: 404 });

  await db.insert(pageFeedback).values({
    pageId: page.id,
    path: page.path,
    helpful: body.helpful,
    comment,
  });
  return Response.json({ ok: true });
}
