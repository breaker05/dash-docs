import { auth } from "@/auth";
import { db } from "@/db";
import { searchLog } from "@/db/schema";
import { searchPages } from "@/server/search";
import {
  checkRateLimit,
  rateLimitedResponse,
  requestIp,
} from "@/server/rate-limit";

export const runtime = "nodejs";

/**
 * JSON search endpoint for the ⌘K palette. Session-aware (team members get
 * internal pages); anonymous queries are logged so zero-result searches
 * surface in Admin → Insights as "docs to write next".
 */
export async function GET(request: Request) {
  const limit = await checkRateLimit(db, {
    key: `search:ip:${requestIp(request)}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!limit.allowed) return rateLimitedResponse(limit);

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query === "") return Response.json({ results: [] });

  const session = await auth();
  const results = await searchPages(db, {
    query,
    includeInternal: Boolean(session?.user),
    limit: 8,
  });

  if (!session?.user) {
    // fire-and-forget: logging must never slow or break search
    db.insert(searchLog)
      .values({ query: query.slice(0, 200), resultCount: results.length })
      .catch(() => {});
  }

  return Response.json({
    results: results.map((r) => ({
      id: r.id,
      title: r.title,
      path: r.path,
      snippet: r.snippet.replaceAll("⟪", "").replaceAll("⟫", ""),
    })),
  });
}
