import Link from "next/link";
import { desc, eq, gt, isNotNull, sql, and } from "drizzle-orm";
import { db } from "@/db";
import { pageFeedback, pages, searchLog } from "@/db/schema";
import { findBrokenLinks } from "@/server/link-check";
import { requireUser } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Insights — Dash Docs" };

export default async function InsightsPage() {
  await requireUser();
  // Server Component: Date.now() at request time is correct — the purity rule
  // targets client render, where re-renders would make it unstable.
  // eslint-disable-next-line react-hooks/purity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [gaps, topQueries, feedbackTotals, recentComments, brokenLinks] =
    await Promise.all([
      db
        .select({ query: searchLog.query, count: sql<number>`count(*)::int` })
        .from(searchLog)
        .where(
          and(
            eq(searchLog.resultCount, 0),
            gt(searchLog.createdAt, thirtyDaysAgo),
          ),
        )
        .groupBy(searchLog.query)
        .orderBy(desc(sql`count(*)`))
        .limit(20),
      db
        .select({ query: searchLog.query, count: sql<number>`count(*)::int` })
        .from(searchLog)
        .where(gt(searchLog.createdAt, thirtyDaysAgo))
        .groupBy(searchLog.query)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
      db
        .select({
          pageId: pageFeedback.pageId,
          path: pageFeedback.path,
          title: pages.title,
          up: sql<number>`count(*) filter (where ${pageFeedback.helpful})::int`,
          down: sql<number>`count(*) filter (where not ${pageFeedback.helpful})::int`,
        })
        .from(pageFeedback)
        .innerJoin(pages, eq(pages.id, pageFeedback.pageId))
        .groupBy(pageFeedback.pageId, pageFeedback.path, pages.title)
        .orderBy(desc(sql`count(*)`))
        .limit(20),
      db
        .select({
          comment: pageFeedback.comment,
          path: pageFeedback.path,
          title: pages.title,
          createdAt: pageFeedback.createdAt,
        })
        .from(pageFeedback)
        .innerJoin(pages, eq(pages.id, pageFeedback.pageId))
        .where(isNotNull(pageFeedback.comment))
        .orderBy(desc(pageFeedback.createdAt))
        .limit(20),
      findBrokenLinks(db),
    ]);

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Insights</h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-muted-foreground">
        What readers are looking for, what they think of the docs, and links
        that need fixing.
      </p>

      <h2 className="mb-1 text-lg font-semibold tracking-tight">
        Search gaps
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Public searches from the last 30 days that returned{" "}
        <strong>zero results</strong> — the docs people wanted but didn’t
        find.
      </p>
      {gaps.length === 0 ? (
        <p className="mb-8 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          No zero-result searches recorded yet. They’ll show up here as
          visitors use search.
        </p>
      ) : (
        <ul className="mb-8 divide-y rounded-lg border">
          {gaps.map((g) => (
            <li
              key={g.query}
              className="flex items-center justify-between px-4 py-2 text-sm"
            >
              <span className="truncate font-medium">“{g.query}”</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {g.count}×
              </span>
            </li>
          ))}
        </ul>
      )}

      {topQueries.length > 0 && (
        <>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">
            Top searches (30 days)
          </h2>
          <div className="mb-8 flex flex-wrap gap-1.5">
            {topQueries.map((q) => (
              <Badge key={q.query} variant="secondary">
                {q.query} · {q.count}
              </Badge>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-3 text-lg font-semibold tracking-tight">
        Page feedback
      </h2>
      {feedbackTotals.length === 0 ? (
        <p className="mb-8 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          No votes yet — every public page asks “Was this page helpful?” at
          the bottom.
        </p>
      ) : (
        <ul className="mb-4 divide-y rounded-lg border">
          {feedbackTotals.map((f) => (
            <li
              key={f.pageId}
              className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
            >
              <Link
                href={`/admin/pages/${f.pageId}`}
                className="min-w-0 truncate font-medium hover:underline"
              >
                {f.title}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">
                👍 {f.up} · 👎 {f.down}
              </span>
            </li>
          ))}
        </ul>
      )}
      {recentComments.length > 0 && (
        <ul className="mb-8 space-y-2">
          {recentComments.map((c, i) => (
            <li
              key={i}
              className="rounded-lg border bg-muted/30 px-4 py-2.5 text-sm"
            >
              <p className="mb-1 leading-relaxed">“{c.comment}”</p>
              <p className="text-xs text-muted-foreground">
                on {c.title} ·{" "}
                {c.createdAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-1 text-lg font-semibold tracking-tight">
        Broken links
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Internal links that don’t resolve to a page or redirect.
      </p>
      {brokenLinks.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          All internal links resolve. 🎉
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {brokenLinks.map((b, i) => (
            <li key={i} className="px-4 py-2 text-sm">
              <span className="font-mono text-xs">{b.href}</span>{" "}
              <span className="text-muted-foreground">
                in{" "}
                <Link
                  href={`/admin/pages/${b.pageId}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {b.pageTitle}
                </Link>{" "}
                ({b.in})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
