import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { pages } from "@/db/schema";
import { markdownToPlainText } from "@/lib/markdoc/plain-text";
import { insertRevision } from "./revisions";

export async function publishPage(
  db: Db,
  opts: { id: string; userId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [page] = await tx.select().from(pages).where(eq(pages.id, opts.id));
    if (!page) throw new Error("Page not found");

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
}
