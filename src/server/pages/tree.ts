import { and, asc, eq, isNull, sql } from "drizzle-orm";
import GithubSlugger from "github-slugger";
import type { Db } from "@/db";
import { pages, redirects, type Page } from "@/db/schema";

export type TreeNode = Page & { children: TreeNode[] };

export function slugify(title: string): string {
  const s = new GithubSlugger().slug(title.trim() || "untitled");
  return s || "untitled";
}

/** All pages assembled into an ordered tree (docs scale: one query + JS). */
export async function getTree(db: Db): Promise<TreeNode[]> {
  const rows = await db
    .select()
    .from(pages)
    .orderBy(asc(pages.position), asc(pages.createdAt));
  const byId = new Map<string, TreeNode>(
    rows.map((r) => [r.id, { ...r, children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

async function siblingsOf(db: Db, parentId: string | null): Promise<Page[]> {
  return db
    .select()
    .from(pages)
    .where(parentId === null ? isNull(pages.parentId) : eq(pages.parentId, parentId))
    .orderBy(asc(pages.position));
}

async function dedupeSlug(
  db: Db,
  parentId: string | null,
  base: string,
  excludeId?: string,
): Promise<string> {
  const sibs = await siblingsOf(db, parentId);
  const taken = new Set(
    sibs.filter((s) => s.id !== excludeId).map((s) => s.slug),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function createPage(
  db: Db,
  opts: { title: string; parentId?: string | null; userId: string },
): Promise<Page> {
  const parentId = opts.parentId ?? null;
  return db.transaction(async (tx) => {
    let parent: Page | undefined;
    if (parentId) {
      [parent] = await tx.select().from(pages).where(eq(pages.id, parentId));
      if (!parent) throw new Error("Parent page not found");
    }
    const slug = await dedupeSlug(tx, parentId, slugify(opts.title));
    const sibs = await siblingsOf(tx, parentId);
    const [row] = await tx
      .insert(pages)
      .values({
        title: opts.title.trim() || "Untitled",
        parentId,
        slug,
        path: parent ? `${parent.path}/${slug}` : slug,
        position: sibs.length,
        effectiveVisibility:
          parent?.effectiveVisibility === "internal" ? "internal" : "public",
        updatedBy: opts.userId,
      })
      .returning();
    return row;
  });
}

/** Thrown when a draft save would overwrite someone else's newer save. */
export const DRAFT_CONFLICT = "DRAFT_CONFLICT";

/**
 * Save draft changes. When `baseDraftUpdatedAt` is given (the timestamp the
 * client loaded or last saved), the write is rejected with DRAFT_CONFLICT if
 * the row has been saved since — so concurrent editors can't silently
 * overwrite each other. Returns the new draftUpdatedAt for the client to
 * carry forward.
 */
export async function updateDraft(
  db: Db,
  opts: {
    id: string;
    title?: string;
    contentMd?: string;
    userId: string;
    baseDraftUpdatedAt?: Date;
  },
): Promise<{ draftUpdatedAt: Date }> {
  const updated = await db
    .update(pages)
    .set({
      ...(opts.title !== undefined ? { title: opts.title } : {}),
      ...(opts.contentMd !== undefined ? { contentMd: opts.contentMd } : {}),
      // clock_timestamp (not now()): distinct per statement even inside a
      // transaction; ms-truncated so the value round-trips through JS Dates
      // exactly and the precondition compares clean
      draftUpdatedAt: sql`date_trunc('milliseconds', clock_timestamp())`,
      updatedBy: opts.userId,
    })
    .where(
      opts.baseDraftUpdatedAt
        ? and(
            eq(pages.id, opts.id),
            sql`${pages.draftUpdatedAt} <= ${opts.baseDraftUpdatedAt}`,
          )
        : eq(pages.id, opts.id),
    )
    .returning({ draftUpdatedAt: pages.draftUpdatedAt });
  if (updated.length === 0) {
    const [exists] = await db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.id, opts.id));
    throw new Error(exists ? DRAFT_CONFLICT : "Page not found");
  }
  return updated[0];
}

/**
 * Recompute `path` and `effective_visibility` for every page from the tree
 * structure, writing only changed rows and inserting redirects for published
 * pages whose path changed. Runs inside the caller's transaction. At docs
 * scale (hundreds of pages) full recompute is simpler and safer than
 * subtree-targeted recursion.
 */
async function recomputeDerived(tx: Db): Promise<void> {
  const rows = await tx.select().from(pages);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const children = new Map<string | null, Page[]>();
  for (const r of rows) {
    const key = r.parentId && byId.has(r.parentId) ? r.parentId : null;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(r);
  }

  const updates: Array<{
    id: string;
    path: string;
    effectiveVisibility: "public" | "internal";
    oldPath: string;
    published: boolean;
  }> = [];

  const visit = (
    node: Page,
    parentPath: string | null,
    parentInternal: boolean,
  ) => {
    const path = parentPath ? `${parentPath}/${node.slug}` : node.slug;
    const internal = parentInternal || node.visibility === "internal";
    const effectiveVisibility = internal ? "internal" : "public";
    if (path !== node.path || effectiveVisibility !== node.effectiveVisibility) {
      updates.push({
        id: node.id,
        path,
        effectiveVisibility,
        oldPath: node.path,
        published: node.publishedContentMd !== null,
      });
    }
    for (const child of children.get(node.id) ?? []) {
      visit(child, path, internal);
    }
  };
  for (const root of children.get(null) ?? []) visit(root, null, false);

  for (const u of updates) {
    if (u.published && u.oldPath !== u.path) {
      await tx
        .insert(redirects)
        .values({ fromPath: u.oldPath.toLowerCase(), toPageId: u.id })
        .onConflictDoUpdate({
          target: redirects.fromPath,
          set: { toPageId: u.id },
        });
    }
    await tx
      .update(pages)
      .set({ path: u.path, effectiveVisibility: u.effectiveVisibility })
      .where(eq(pages.id, u.id));
  }
}

export async function movePage(
  db: Db,
  opts: {
    id: string;
    newParentId: string | null;
    newIndex: number;
    userId: string;
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [page] = await tx.select().from(pages).where(eq(pages.id, opts.id));
    if (!page) throw new Error("Page not found");

    if (opts.newParentId) {
      if (opts.newParentId === opts.id) {
        throw new Error("Cannot move a page under itself");
      }
      // walk up from the new parent; hitting the moved page means cycle
      let cursor: string | null = opts.newParentId;
      while (cursor) {
        if (cursor === opts.id) {
          throw new Error("Cannot move a page into its own descendant");
        }
        const [p] = await tx
          .select({ parentId: pages.parentId })
          .from(pages)
          .where(eq(pages.id, cursor));
        if (!p) throw new Error("New parent not found");
        cursor = p.parentId;
      }
    }

    const oldParentId = page.parentId;
    const targetSibs = (await siblingsOf(tx, opts.newParentId)).filter(
      (s) => s.id !== opts.id,
    );
    const index = Math.max(0, Math.min(opts.newIndex, targetSibs.length));
    targetSibs.splice(index, 0, page);

    // slug may collide in the new parent
    const slug = await dedupeSlug(tx, opts.newParentId, page.slug, page.id);

    await tx
      .update(pages)
      .set({ parentId: opts.newParentId, slug, updatedBy: opts.userId })
      .where(eq(pages.id, opts.id));

    for (let i = 0; i < targetSibs.length; i++) {
      await tx
        .update(pages)
        .set({ position: i })
        .where(eq(pages.id, targetSibs[i].id));
    }
    // close the gap in the old parent
    if (oldParentId !== opts.newParentId) {
      const oldSibs = (await siblingsOf(tx, oldParentId ?? null)).filter(
        (s) => s.id !== opts.id,
      );
      for (let i = 0; i < oldSibs.length; i++) {
        await tx
          .update(pages)
          .set({ position: i })
          .where(eq(pages.id, oldSibs[i].id));
      }
    }

    await recomputeDerived(tx);
  });
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function renamePage(
  db: Db,
  opts: { id: string; slug: string; userId: string },
): Promise<void> {
  const slug = opts.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      "Slug must be lowercase letters, numbers, and dashes (e.g. lead-submission-api)",
    );
  }
  await db.transaction(async (tx) => {
    const [page] = await tx.select().from(pages).where(eq(pages.id, opts.id));
    if (!page) throw new Error("Page not found");
    const sibs = await siblingsOf(tx, page.parentId);
    if (sibs.some((s) => s.id !== page.id && s.slug === slug)) {
      throw new Error("A sibling page already uses that slug");
    }
    await tx
      .update(pages)
      .set({ slug, updatedBy: opts.userId })
      .where(eq(pages.id, opts.id));
    await recomputeDerived(tx);
  });
}

export async function setVisibility(
  db: Db,
  opts: { id: string; visibility: "public" | "internal"; userId: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(pages)
      .set({ visibility: opts.visibility, updatedBy: opts.userId })
      .where(eq(pages.id, opts.id));
    await recomputeDerived(tx);
  });
}

export async function setPageIcon(
  db: Db,
  opts: { id: string; icon: string | null; userId: string },
): Promise<void> {
  await db
    .update(pages)
    .set({ icon: opts.icon, updatedBy: opts.userId })
    .where(eq(pages.id, opts.id));
}

export async function deletePage(db: Db, id: string): Promise<void> {
  await db.delete(pages).where(eq(pages.id, id));
}

export async function setHomePage(db: Db, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(pages).set({ isHome: false }).where(eq(pages.isHome, true));
    await tx.update(pages).set({ isHome: true }).where(eq(pages.id, id));
  });
}

/** Resolve a page id → row, or null. */
export async function getPage(db: Db, id: string): Promise<Page | null> {
  const [row] = await db.select().from(pages).where(eq(pages.id, id));
  return row ?? null;
}

export async function getPageByPath(db: Db, path: string): Promise<Page | null> {
  const [row] = await db.select().from(pages).where(eq(pages.path, path));
  return row ?? null;
}

export async function findRedirect(
  db: Db,
  fromPath: string,
): Promise<{ toPath: string } | null> {
  const [row] = await db
    .select({ toPath: pages.path })
    .from(redirects)
    .innerJoin(pages, eq(redirects.toPageId, pages.id))
    .where(
      and(eq(redirects.fromPath, fromPath.toLowerCase().replace(/\.html?$/, ""))),
    );
  return row ?? null;
}
