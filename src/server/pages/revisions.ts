import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { pageRevisions, pages, type PageRevision } from "@/db/schema";

const KEEP_NON_PUBLISH = 50;

/**
 * Insert a revision snapshot of a page's current draft with the next
 * version number, then prune old non-publish revisions. `publish`
 * revisions are kept forever. Call inside a transaction.
 */
export async function insertRevision(
  tx: Db,
  opts: {
    pageId: string;
    title: string;
    contentMd: string;
    kind: "publish" | "manual" | "pre_restore" | "import";
    userId: string | null;
  },
): Promise<PageRevision> {
  const [latest] = await tx
    .select({ version: pageRevisions.version })
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, opts.pageId))
    .orderBy(desc(pageRevisions.version))
    .limit(1);

  const [revision] = await tx
    .insert(pageRevisions)
    .values({
      pageId: opts.pageId,
      version: (latest?.version ?? 0) + 1,
      title: opts.title,
      contentMd: opts.contentMd,
      kind: opts.kind,
      createdBy: opts.userId,
    })
    .returning();

  if (opts.kind !== "publish") {
    const stale = await tx
      .select({ id: pageRevisions.id })
      .from(pageRevisions)
      .where(
        and(
          eq(pageRevisions.pageId, opts.pageId),
          ne(pageRevisions.kind, "publish"),
        ),
      )
      .orderBy(desc(pageRevisions.version))
      .offset(KEEP_NON_PUBLISH);
    if (stale.length > 0) {
      await tx.delete(pageRevisions).where(
        inArray(
          pageRevisions.id,
          stale.map((s) => s.id),
        ),
      );
    }
  }
  return revision;
}

export async function listRevisions(
  db: Db,
  pageId: string,
): Promise<PageRevision[]> {
  return db
    .select()
    .from(pageRevisions)
    .where(eq(pageRevisions.pageId, pageId))
    .orderBy(desc(pageRevisions.version));
}

export async function getRevision(
  db: Db,
  revisionId: string,
): Promise<PageRevision | null> {
  const [rev] = await db
    .select()
    .from(pageRevisions)
    .where(eq(pageRevisions.id, revisionId));
  return rev ?? null;
}

/** "Save version" — a named checkpoint of the current draft. */
export async function saveManualRevision(
  db: Db,
  opts: { pageId: string; userId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [page] = await tx
      .select()
      .from(pages)
      .where(eq(pages.id, opts.pageId));
    if (!page) throw new Error("Page not found");
    await insertRevision(tx, {
      pageId: opts.pageId,
      title: page.title,
      contentMd: page.contentMd,
      kind: "manual",
      userId: opts.userId,
    });
  });
}

/**
 * Copy a revision's content back into the draft. The current draft is
 * snapshotted first (kind `pre_restore`) so nothing is lost. Never touches
 * the published columns — publishing the restored draft is a separate step.
 */
export async function restoreRevision(
  db: Db,
  opts: { pageId: string; revisionId: string; userId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [page] = await tx
      .select()
      .from(pages)
      .where(eq(pages.id, opts.pageId));
    if (!page) throw new Error("Page not found");
    const [rev] = await tx
      .select()
      .from(pageRevisions)
      .where(
        and(
          eq(pageRevisions.id, opts.revisionId),
          eq(pageRevisions.pageId, opts.pageId),
        ),
      );
    if (!rev) throw new Error("Revision not found for this page");

    await insertRevision(tx, {
      pageId: opts.pageId,
      title: page.title,
      contentMd: page.contentMd,
      kind: "pre_restore",
      userId: opts.userId,
    });

    await tx
      .update(pages)
      .set({
        title: rev.title,
        contentMd: rev.contentMd,
        draftUpdatedAt: sql`now()`,
        updatedBy: opts.userId,
      })
      .where(eq(pages.id, opts.pageId));
  });
}
