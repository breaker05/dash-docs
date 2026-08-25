import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { pageTags, pages, tags, type Tag } from "@/db/schema";
import { slugify } from "./pages/tree";

export async function listTags(db: Db): Promise<Tag[]> {
  return db.select().from(tags).orderBy(asc(tags.name));
}

export async function createTag(db: Db, name: string): Promise<Tag> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tag name is required");
  const [tag] = await db
    .insert(tags)
    .values({ name: trimmed, slug: slugify(trimmed) })
    .onConflictDoNothing({ target: tags.slug })
    .returning();
  if (!tag) {
    const [existing] = await db
      .select()
      .from(tags)
      .where(eq(tags.slug, slugify(trimmed)));
    return existing;
  }
  return tag;
}

export async function renameTag(
  db: Db,
  opts: { id: string; name: string },
): Promise<void> {
  const trimmed = opts.name.trim();
  if (!trimmed) throw new Error("Tag name is required");
  await db
    .update(tags)
    .set({ name: trimmed, slug: slugify(trimmed) })
    .where(eq(tags.id, opts.id));
}

export async function deleteTag(db: Db, id: string): Promise<void> {
  await db.delete(tags).where(eq(tags.id, id));
}

export async function getPageTagIds(db: Db, pageId: string): Promise<string[]> {
  const rows = await db
    .select({ tagId: pageTags.tagId })
    .from(pageTags)
    .where(eq(pageTags.pageId, pageId));
  return rows.map((r) => r.tagId);
}

export async function setPageTags(
  db: Db,
  opts: { pageId: string; tagIds: string[] },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(pageTags).where(eq(pageTags.pageId, opts.pageId));
    if (opts.tagIds.length > 0) {
      await tx
        .insert(pageTags)
        .values(opts.tagIds.map((tagId) => ({ pageId: opts.pageId, tagId })));
    }
  });
}

function visiblePages(includeInternal: boolean) {
  return and(
    isNotNull(pages.publishedContentMd),
    includeInternal ? undefined : eq(pages.effectiveVisibility, "public"),
  );
}

export type PublicTag = { id: string; name: string; slug: string; count: number };

/** Tags that have at least one published page the viewer may see. */
export async function getPublicTags(
  db: Db,
  includeInternal: boolean,
): Promise<PublicTag[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      count: sql<number>`count(*)::int`,
    })
    .from(tags)
    .innerJoin(pageTags, eq(pageTags.tagId, tags.id))
    .innerJoin(pages, eq(pages.id, pageTags.pageId))
    .where(visiblePages(includeInternal))
    .groupBy(tags.id, tags.name, tags.slug)
    .orderBy(asc(tags.name));
}

export type TagPageEntry = {
  id: string;
  title: string;
  path: string;
  icon: string | null;
  internal: boolean;
  excerpt: string;
};

/** A tag plus the published pages the viewer may see, or null if none. */
export async function getTagPages(
  db: Db,
  slug: string,
  includeInternal: boolean,
): Promise<{ tag: Tag; pages: TagPageEntry[] } | null> {
  const [tag] = await db.select().from(tags).where(eq(tags.slug, slug));
  if (!tag) return null;
  const rows = await db
    .select({
      id: pages.id,
      title: pages.publishedTitle,
      path: pages.path,
      icon: pages.icon,
      effectiveVisibility: pages.effectiveVisibility,
      plain: pages.publishedPlain,
    })
    .from(pageTags)
    .innerJoin(pages, eq(pages.id, pageTags.pageId))
    .where(and(eq(pageTags.tagId, tag.id), visiblePages(includeInternal)))
    .orderBy(asc(pages.path));
  if (rows.length === 0) return null;
  return {
    tag,
    pages: rows.map((r) => ({
      id: r.id,
      title: r.title ?? "",
      path: r.path,
      icon: r.icon,
      internal: r.effectiveVisibility === "internal",
      excerpt: (r.plain ?? "").slice(0, 160).replace(/\s+\S*$/, ""),
    })),
  };
}

/** Tags attached to one page (for article chips). */
export async function getTagsForPage(db: Db, pageId: string): Promise<Tag[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      createdAt: tags.createdAt,
    })
    .from(pageTags)
    .innerJoin(tags, eq(tags.id, pageTags.tagId))
    .where(eq(pageTags.pageId, pageId))
    .orderBy(asc(tags.name));
}

export async function getPageIdsForTag(
  db: Db,
  tagSlug: string,
): Promise<string[]> {
  const [tag] = await db.select().from(tags).where(eq(tags.slug, tagSlug));
  if (!tag) return [];
  const rows = await db
    .select({ pageId: pageTags.pageId })
    .from(pageTags)
    .where(inArray(pageTags.tagId, [tag.id]));
  return rows.map((r) => r.pageId);
}
