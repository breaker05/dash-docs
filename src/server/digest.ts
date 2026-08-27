import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { pageRevisions, pages } from "@/db/schema";

export type ChangelogEntry = {
  pageId: string;
  title: string;
  path: string;
  isHome: boolean;
  internal: boolean;
  publishedAt: Date;
  /** false → this publish was the page's first */
  isUpdate: boolean;
};

/**
 * Publish events, newest first. `includeInternal: false` for the public
 * changelog; true for the team Slack digest.
 */
export async function recentPublishes(
  db: Db,
  opts: { since?: Date; limit?: number; includeInternal: boolean },
): Promise<ChangelogEntry[]> {
  const rows = await db
    .select({
      pageId: pageRevisions.pageId,
      createdAt: pageRevisions.createdAt,
      title: pages.publishedTitle,
      path: pages.path,
      isHome: pages.isHome,
      visibility: pages.effectiveVisibility,
      // scalar subquery, not a window function: the first publish must be
      // computed over ALL publish revisions, not just the filtered window
      firstPublish: sql<Date>`(select min(pr2.created_at) from page_revision pr2 where pr2.page_id = ${pageRevisions.pageId} and pr2.kind = 'publish')`,
    })
    .from(pageRevisions)
    .innerJoin(pages, eq(pages.id, pageRevisions.pageId))
    .where(
      and(
        eq(pageRevisions.kind, "publish"),
        isNotNull(pages.publishedContentMd),
        opts.includeInternal
          ? sql`true`
          : eq(pages.effectiveVisibility, "public"),
        opts.since ? gt(pageRevisions.createdAt, opts.since) : sql`true`,
      ),
    )
    .orderBy(desc(pageRevisions.createdAt))
    .limit(opts.limit ?? 50);

  // one entry per page: rows are newest-first, keep the latest publish
  const seen = new Set<string>();
  const entries: ChangelogEntry[] = [];
  for (const r of rows) {
    if (seen.has(r.pageId)) continue;
    seen.add(r.pageId);
    entries.push({
      pageId: r.pageId,
      title: r.title ?? "Untitled",
      path: r.path,
      isHome: r.isHome,
      internal: r.visibility === "internal",
      publishedAt: r.createdAt,
      isUpdate: new Date(r.firstPublish).getTime() < r.createdAt.getTime(),
    });
  }
  return entries;
}

/** Slack-formatted weekly digest message (mrkdwn). */
export function formatDigest(
  entries: ChangelogEntry[],
  siteUrl: string,
): string {
  if (entries.length === 0) {
    return "*Dash Docs — weekly digest*\nNo pages were published this week.";
  }
  const lines = entries.map((e) => {
    const url = e.isHome ? siteUrl : `${siteUrl}/${e.path}`;
    const verb = e.isUpdate ? "updated" : "new";
    const lock = e.internal ? " 🔒" : "";
    return `• <${url}|${e.title.replaceAll(">", "＞")}>${lock} — ${verb}`;
  });
  return [
    `*Dash Docs — what changed this week* (${entries.length} ${entries.length === 1 ? "page" : "pages"})`,
    ...lines,
  ].join("\n");
}

export async function postToSlack(
  webhookUrl: string,
  text: string,
): Promise<boolean> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return res.ok;
}
