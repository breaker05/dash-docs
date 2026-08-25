import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { pageRevisions, pages, users } from "@/db/schema";
import { createPage, updateDraft } from "./tree";
import { publishPage } from "./publish";
import {
  listRevisions,
  restoreRevision,
  saveManualRevision,
} from "./revisions";

let db: Db;
let close: () => Promise<void>;
let userId: string;
let pageId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await db
    .insert(users)
    .values({ email: "t@dashmarketing.io", role: "admin" })
    .returning();
  userId = u.id;
  const page = await createPage(db, { title: "Guide", userId });
  pageId = page.id;
});

afterEach(async () => {
  await close();
});

describe("saveManualRevision", () => {
  it("snapshots the current draft with an incrementing version", async () => {
    await updateDraft(db, { id: pageId, contentMd: "v1", userId });
    await saveManualRevision(db, { pageId, userId });
    await updateDraft(db, { id: pageId, contentMd: "v2", userId });
    await saveManualRevision(db, { pageId, userId });

    const revs = await listRevisions(db, pageId);
    expect(revs.map((r) => [r.version, r.kind])).toEqual([
      [2, "manual"],
      [1, "manual"],
    ]);
  });

  it("prunes non-publish revisions beyond the newest 50, keeping publish", async () => {
    await publishPage(db, { id: pageId, userId }); // version 1, kind publish
    for (let i = 0; i < 55; i++) {
      await saveManualRevision(db, { pageId, userId });
    }
    const revs = await db
      .select()
      .from(pageRevisions)
      .where(eq(pageRevisions.pageId, pageId));
    const manual = revs.filter((r) => r.kind === "manual");
    const publish = revs.filter((r) => r.kind === "publish");
    expect(manual).toHaveLength(50);
    expect(publish).toHaveLength(1);
    // the newest survive
    expect(Math.max(...manual.map((r) => r.version))).toBe(56);
  });
});

describe("restoreRevision", () => {
  it("copies revision into draft, snapshots prior draft, never touches live", async () => {
    await updateDraft(db, { id: pageId, contentMd: "original", userId });
    await publishPage(db, { id: pageId, userId }); // rev v1 = original, live
    await updateDraft(db, { id: pageId, contentMd: "newer draft", userId });

    const [v1] = await listRevisions(db, pageId);
    await restoreRevision(db, { pageId, revisionId: v1.id, userId });

    const [row] = await db.select().from(pages).where(eq(pages.id, pageId));
    // draft restored to v1 content
    expect(row.contentMd).toBe("original");
    // live site unchanged
    expect(row.publishedContentMd).toBe("original");

    const revs = await listRevisions(db, pageId);
    // v1 (publish) + pre_restore snapshot of "newer draft"
    expect(revs.map((r) => r.kind).sort()).toEqual(["pre_restore", "publish"]);
    const preRestore = revs.find((r) => r.kind === "pre_restore")!;
    expect(preRestore.contentMd).toBe("newer draft");
  });

  it("rejects restoring a revision belonging to another page", async () => {
    const other = await createPage(db, { title: "Other", userId });
    await saveManualRevision(db, { pageId: other.id, userId });
    const [rev] = await listRevisions(db, other.id);
    await expect(
      restoreRevision(db, { pageId, revisionId: rev.id, userId }),
    ).rejects.toThrow();
  });
});
