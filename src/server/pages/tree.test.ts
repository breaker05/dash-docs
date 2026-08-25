import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { pages, redirects, users } from "@/db/schema";
import {
  createPage,
  deletePage,
  movePage,
  renamePage,
  setPageIcon,
  setVisibility,
  getTree,
} from "./tree";

let db: Db;
let close: () => Promise<void>;
let userId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await db
    .insert(users)
    .values({ email: "t@dashmarketing.io" })
    .returning();
  userId = u.id;
});

afterEach(async () => {
  await close();
});

async function pageByPath(path: string) {
  const [p] = await db.select().from(pages).where(eq(pages.path, path));
  return p;
}

describe("createPage", () => {
  it("creates root pages with slug from title and appends position", async () => {
    const a = await createPage(db, { title: "Getting Started", userId });
    const b = await createPage(db, { title: "API Guide", userId });
    expect(a.slug).toBe("getting-started");
    expect(a.path).toBe("getting-started");
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
  });

  it("creates nested pages with parent-prefixed path", async () => {
    const parent = await createPage(db, { title: "Guides", userId });
    const child = await createPage(db, {
      title: "Webhooks",
      parentId: parent.id,
      userId,
    });
    expect(child.path).toBe("guides/webhooks");
  });

  it("de-duplicates colliding slugs among siblings", async () => {
    const a = await createPage(db, { title: "Setup", userId });
    const b = await createPage(db, { title: "Setup", userId });
    expect(a.slug).toBe("setup");
    expect(b.slug).toBe("setup-2");
  });

  it("inherits internal visibility from the parent", async () => {
    const parent = await createPage(db, { title: "Internal", userId });
    await setVisibility(db, { id: parent.id, visibility: "internal", userId });
    const child = await createPage(db, {
      title: "PTO Policy",
      parentId: parent.id,
      userId,
    });
    expect(child.effectiveVisibility).toBe("internal");
  });
});

describe("movePage", () => {
  it("recomputes paths for the moved subtree and renumbers siblings", async () => {
    const guides = await createPage(db, { title: "Guides", userId });
    const api = await createPage(db, { title: "API", userId });
    const hooks = await createPage(db, {
      title: "Webhooks",
      parentId: guides.id,
      userId,
    });
    await createPage(db, { title: "Retries", parentId: hooks.id, userId });

    await movePage(db, { id: hooks.id, newParentId: api.id, newIndex: 0, userId });

    expect(await pageByPath("api/webhooks")).toBeTruthy();
    expect(await pageByPath("api/webhooks/retries")).toBeTruthy();
    expect(await pageByPath("guides/webhooks")).toBeFalsy();
  });

  it("reorders within the same parent", async () => {
    const a = await createPage(db, { title: "A", userId });
    const b = await createPage(db, { title: "B", userId });
    const c = await createPage(db, { title: "C", userId });
    await movePage(db, { id: c.id, newParentId: null, newIndex: 0, userId });
    const tree = await getTree(db);
    expect(tree.map((n) => n.id)).toEqual([c.id, a.id, b.id]);
  });

  it("rejects moving a page into its own descendant", async () => {
    const a = await createPage(db, { title: "A", userId });
    const b = await createPage(db, { title: "B", parentId: a.id, userId });
    await expect(
      movePage(db, { id: a.id, newParentId: b.id, newIndex: 0, userId }),
    ).rejects.toThrow(/descendant/i);
  });

  it("creates redirects for published pages whose path changed", async () => {
    const guides = await createPage(db, { title: "Guides", userId });
    const hooks = await createPage(db, {
      title: "Webhooks",
      parentId: guides.id,
      userId,
    });
    // mark published directly (publish flow is Phase 2)
    await db
      .update(pages)
      .set({ publishedTitle: "Webhooks", publishedContentMd: "x" })
      .where(eq(pages.id, hooks.id));

    await movePage(db, { id: hooks.id, newParentId: null, newIndex: 0, userId });

    const rows = await db.select().from(redirects);
    expect(rows).toHaveLength(1);
    expect(rows[0].fromPath).toBe("guides/webhooks");
    expect(rows[0].toPageId).toBe(hooks.id);
  });

  it("does not create redirects for never-published pages", async () => {
    const guides = await createPage(db, { title: "Guides", userId });
    const hooks = await createPage(db, {
      title: "Webhooks",
      parentId: guides.id,
      userId,
    });
    await movePage(db, { id: hooks.id, newParentId: null, newIndex: 0, userId });
    expect(await db.select().from(redirects)).toHaveLength(0);
  });
});

describe("renamePage", () => {
  it("updates slug, recomputes descendant paths, adds redirects for published", async () => {
    const guides = await createPage(db, { title: "Guides", userId });
    const child = await createPage(db, {
      title: "Webhooks",
      parentId: guides.id,
      userId,
    });
    await db
      .update(pages)
      .set({ publishedTitle: "w", publishedContentMd: "x" })
      .where(eq(pages.id, child.id));

    await renamePage(db, { id: guides.id, slug: "how-to", userId });

    expect(await pageByPath("how-to/webhooks")).toBeTruthy();
    const rows = await db.select().from(redirects);
    expect(rows.map((r) => r.fromPath)).toEqual(["guides/webhooks"]);
  });
});

describe("setVisibility", () => {
  it("cascades internal down and restores public correctly", async () => {
    const parent = await createPage(db, { title: "Handbook", userId });
    const child = await createPage(db, {
      title: "PTO",
      parentId: parent.id,
      userId,
    });
    const grand = await createPage(db, {
      title: "Accrual",
      parentId: child.id,
      userId,
    });
    // child explicitly internal
    await setVisibility(db, { id: child.id, visibility: "internal", userId });
    // parent internal → everything internal
    await setVisibility(db, { id: parent.id, visibility: "internal", userId });
    const all = await db.select().from(pages);
    expect(all.every((p) => p.effectiveVisibility === "internal")).toBe(true);

    // parent back to public: child stays internal (explicit), so does grandchild
    await setVisibility(db, { id: parent.id, visibility: "public", userId });
    const parentRow = (await db.select().from(pages).where(eq(pages.id, parent.id)))[0];
    const childRow = (await db.select().from(pages).where(eq(pages.id, child.id)))[0];
    const grandRow = (await db.select().from(pages).where(eq(pages.id, grand.id)))[0];
    expect(parentRow.effectiveVisibility).toBe("public");
    expect(childRow.effectiveVisibility).toBe("internal");
    expect(grandRow.effectiveVisibility).toBe("internal");
  });
});

describe("setPageIcon", () => {
  it("sets and clears the icon", async () => {
    const page = await createPage(db, { title: "API", userId });
    await setPageIcon(db, { id: page.id, icon: "plug", userId });
    let [row] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(row.icon).toBe("plug");
    await setPageIcon(db, { id: page.id, icon: null, userId });
    [row] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(row.icon).toBeNull();
  });
});

describe("deletePage", () => {
  it("cascades to descendants", async () => {
    const a = await createPage(db, { title: "A", userId });
    await createPage(db, { title: "B", parentId: a.id, userId });
    await deletePage(db, a.id);
    expect(await db.select().from(pages)).toHaveLength(0);
  });
});
