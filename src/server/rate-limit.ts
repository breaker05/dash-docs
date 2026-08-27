import { lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { rateLimits } from "@/db/schema";

export type RateLimitResult = {
  allowed: boolean;
  /** requests left in the current window (0 when blocked) */
  remaining: number;
  /** seconds until the current window resets */
  retryAfterSeconds: number;
};

/**
 * Fixed-window rate limiter backed by Postgres, so limits hold across
 * serverless instances and cold starts. One upsert per request; expired
 * windows are cleaned up lazily on each window's first hit.
 */
export async function checkRateLimit(
  db: Db,
  opts: {
    /** stable identifier, e.g. "mcp:ip:1.2.3.4" */
    key: string;
    limit: number;
    windowSeconds: number;
    /** injectable clock for tests */
    now?: Date;
  },
): Promise<RateLimitResult> {
  const nowMs = (opts.now ?? new Date()).getTime();
  const windowMs = opts.windowSeconds * 1000;
  const bucket = Math.floor(nowMs / windowMs);
  const bucketKey = `${opts.key}:${bucket}`;
  const expiresAt = new Date((bucket + 1) * windowMs);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(((bucket + 1) * windowMs - nowMs) / 1000),
  );

  const [row] = await db
    .insert(rateLimits)
    .values({ key: bucketKey, count: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  // first hit of a window: sweep out expired buckets (tiny table, cheap)
  if (row.count === 1) {
    await db
      .delete(rateLimits)
      .where(lt(rateLimits.expiresAt, new Date(nowMs)));
  }

  return {
    allowed: row.count <= opts.limit,
    remaining: Math.max(0, opts.limit - row.count),
    retryAfterSeconds,
  };
}

/** Client IP as reported by the platform (Vercel sets x-forwarded-for). */
export function requestIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitedResponse(result: RateLimitResult): Response {
  return Response.json(
    { error: "Rate limit exceeded. Slow down and retry shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    },
  );
}
