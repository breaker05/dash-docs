import { eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { pageTags, pages, tags } from "@/db/schema";

export type SearchHit = {
  id: string;
  path: string;
  title: string;
  snippet: string;
};

/**
 * Full-text search over published pages, shared by the public search page
 * and the MCP `search_docs` tool. `includeInternal` must only be true when
 * the caller has a verified session.
 */
export async function searchPages(
  db: Db,
  opts: {
    query: string;
    includeInternal: boolean;
    limit?: number;
    /** restrict results to pages carrying this tag */
    tagSlug?: string;
  },
): Promise<SearchHit[]> {
  // length cap is defense in depth — the query is only ever a bound
  // parameter to websearch_to_tsquery, never interpolated into SQL
  const query = opts.query.trim().slice(0, 200);
  if (!query) return [];
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);

  const visibility = opts.includeInternal
    ? sql`true`
    : sql`${pages.effectiveVisibility} = 'public'`;

  const tagFilter = opts.tagSlug
    ? inArray(
        pages.id,
        db
          .select({ id: pageTags.pageId })
          .from(pageTags)
          .innerJoin(tags, eq(tags.id, pageTags.tagId))
          .where(eq(tags.slug, opts.tagSlug)),
      )
    : sql`true`;

  const rows = await db
    .select({
      id: pages.id,
      path: pages.path,
      title: pages.publishedTitle,
      // ⟪⟫ markers instead of <b> so consumers can render highlights
      // safely without trusting HTML in the content
      snippet: sql<string>`ts_headline('english', ${pages.publishedPlain},
        websearch_to_tsquery('english', ${query}),
        'StartSel=⟪, StopSel=⟫, MaxWords=30, MinWords=15, MaxFragments=2, FragmentDelimiter=" … "')`,
    })
    .from(pages)
    .where(
      sql`${pages.publishedContentMd} is not null
        and ${visibility}
        and ${tagFilter}
        and ${pages.search} @@ websearch_to_tsquery('english', ${query})`,
    )
    .orderBy(
      sql`ts_rank_cd(${pages.search}, websearch_to_tsquery('english', ${query})) desc`,
    )
    .limit(limit);

  return rows.map((r) => ({ ...r, title: r.title ?? "" }));
}
