import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { pages } from "@/db/schema";
import { markdownToPlainText } from "@/lib/markdoc/plain-text";
import { insertRevision } from "./revisions";
import { clearPageChunks, reindexPageChunks } from "./chunks";

export async function publishPage(
  db: Db,
  opts: { id: string; userId: string },
): Promise<void> {
  let contentMd = "";
  await db.transaction(async (tx) => {
    const [page] = await tx.select().from(pages).where(eq(pages.id, opts.id));
    if (!page) throw new Error("Page not found");
    contentMd = page.contentMd;

    const revision = await insertRevision(tx, {
      pageId: opts.id,
      title: page.title,
      contentMd: page.contentMd,
      kind: "publish",
      userId: opts.userId,
    });

    await tx
      .update(pages)
      .set({
        publishedTitle: page.title,
        publishedContentMd: page.contentMd,
        publishedPlain: markdownToPlainText(page.contentMd),
        publishedRevisionId: revision.id,
        publishedAt: sql`now()`,
        publishedBy: opts.userId,
      })
      .where(eq(pages.id, opts.id));
  });

  // Rebuild Ask AI retrieval chunks for the freshly-published content. Best
  // effort: keyword chunks are committed inside reindex before any embedding
  // call, and a failure here (e.g. the embedding API) must never fail a publish.
  try {
    await reindexPageChunks(db, { pageId: opts.id, content: contentMd });
  } catch (err) {
    console.error(`page ${opts.id}: chunk reindex failed after publish`, err);
  }
}

export async function unpublishPage(
  db: Db,
  opts: { id: string },
): Promise<void> {
  await db
    .update(pages)
    .set({
      publishedTitle: null,
      publishedContentMd: null,
      publishedPlain: null,
      publishedRevisionId: null,
      publishedAt: null,
      publishedBy: null,
    })
    .where(eq(pages.id, opts.id));
  // Drop retrieval chunks so an unpublished page can't surface in Ask AI.
  await clearPageChunks(db, opts.id);
}
