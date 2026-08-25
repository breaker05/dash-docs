import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { pageRevisions, pages, users } from "@/db/schema";
import { createPage, updateDraft } from "./tree";
import { publishPage, unpublishPage } from "./publish";

let db: Db;
let close: () => Promise<void>;
let userId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await db
    .insert(users)
    .values({ email: "t@dashmarketing.io", role: "admin" })
    .returning();
  userId = u.id;
});

afterEach(async () => {
  await close();
});

describe("publishPage", () => {
  it("copies draft to published columns and writes a revision", async () => {
    const page = await createPage(db, { title: "Guide", userId });
    await updateDraft(db, {
      id: page.id,
      contentMd: "# Hello\n\n`POST /lead/submit`",
      userId,
    });

    await publishPage(db, { id: page.id, userId });

    const [row] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(row.publishedTitle).toBe("Guide");
    expect(row.publishedContentMd).toContain("Hello");
    expect(row.publishedPlain).toContain("/lead/submit");
    expect(row.publishedAt).toBeTruthy();
    expect(row.publishedRevisionId).toBeTruthy();

    const revs = await db.select().from(pageRevisions);
    expect(revs).toHaveLength(1);
    expect(revs[0].version).toBe(1);
    expect(revs[0].kind).toBe("publish");
  });

  it("increments version on each publish", async () => {
    const page = await createPage(db, { title: "Guide", userId });
    await publishPage(db, { id: page.id, userId });
    await updateDraft(db, { id: page.id, contentMd: "v2", userId });
    await publishPage(db, { id: page.id, userId });
    await publishPage(db, { id: page.id, userId });

    const revs = await db
      .select()
      .from(pageRevisions)
      .where(eq(pageRevisions.pageId, page.id));
    expect(revs.map((r) => r.version).sort()).toEqual([1, 2, 3]);
  });

  it("draft edits do not change published content until re-publish", async () => {
    const page = await createPage(db, { title: "Guide", userId });
    await updateDraft(db, { id: page.id, contentMd: "live", userId });
    await publishPage(db, { id: page.id, userId });
    await updateDraft(db, { id: page.id, contentMd: "draft-only", userId });

    const [row] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(row.publishedContentMd).toBe("live");
    expect(row.contentMd).toBe("draft-only");
  });
});

describe("unpublishPage", () => {
  it("clears published columns but keeps revisions", async () => {
    const page = await createPage(db, { title: "Guide", userId });
    await publishPage(db, { id: page.id, userId });
    await unpublishPage(db, { id: page.id });

    const [row] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(row.publishedContentMd).toBeNull();
    expect(row.publishedTitle).toBeNull();
    expect(row.publishedRevisionId).toBeNull();
    expect(await db.select().from(pageRevisions)).toHaveLength(1);
  });
});
