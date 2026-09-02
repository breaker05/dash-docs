import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { pages } from "@/db/schema";

export type CorpusPage = { path: string; title: string; markdown: string };

/**
 * Every published page's full content, for whole-corpus Ask AI answering.
 * Public-only unless `includeInternal` (a signed-in session). Ordered by path
 * so the assembled prompt is byte-stable across requests — that stability is
 * what lets the large corpus stay in the prompt cache between questions.
 */
export async function getPublishedCorpus(
  db: Db,
  opts: { includeInternal: boolean },
): Promise<CorpusPage[]> {
  const rows = await db
    .select({
      path: pages.path,
      title: pages.publishedTitle,
      markdown: pages.publishedContentMd,
    })
    .from(pages)
    .where(
      and(
        isNotNull(pages.publishedContentMd),
        opts.includeInternal
          ? sql`true`
          : eq(pages.effectiveVisibility, "public"),
      ),
    )
    .orderBy(asc(pages.path));
  return rows.map((r) => ({
    path: r.path,
    title: r.title ?? "Untitled",
    markdown: r.markdown ?? "",
  }));
}
