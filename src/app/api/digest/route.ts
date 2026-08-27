import { db } from "@/db";
import {
  formatDigest,
  postToSlack,
  recentPublishes,
} from "@/server/digest";
import { getSettings, SLACK_WEBHOOK_KEY } from "@/server/settings";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";

/**
 * Weekly Slack digest, invoked by Vercel cron (vercel.json). Vercel sends
 * Authorization: Bearer ${CRON_SECRET} when the env var is set.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSettings(db, [SLACK_WEBHOOK_KEY]);
  const webhook = settings[SLACK_WEBHOOK_KEY];
  if (!webhook) {
    return Response.json({ sent: false, reason: "no webhook configured" });
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const entries = await recentPublishes(db, {
    since,
    includeInternal: true,
    limit: 30,
  });
  const ok = await postToSlack(webhook, formatDigest(entries, siteUrl()));
  return Response.json({ sent: ok, count: entries.length });
}
