import { db } from "@/db";
import { purgeOldConversations } from "@/server/conversations";

export const runtime = "nodejs";

// Ask AI conversations inactive for longer than this are deleted (messages
// cascade). Keep in sync with the note shown to visitors in AskDocs.
const RETENTION_DAYS = 60;

/**
 * Retention cron (vercel.json): purge stale Ask AI conversations. Vercel sends
 * Authorization: Bearer ${CRON_SECRET} when the env var is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const purged = await purgeOldConversations(db, {
    olderThanDays: RETENTION_DAYS,
  });
  return Response.json({ purged, retentionDays: RETENTION_DAYS });
}
