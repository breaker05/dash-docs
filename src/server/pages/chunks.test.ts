import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import { createPage, setVisibility, updateDraft } from "./tree";
import { publishPage } from "./publish";
import {
  clearPageChunks,
  reindexPageChunks,
  searchPageChunks,
} from "./chunks";

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

async function published(title: string, content: string, internal = false) {
  const page = await createPage(db, { title, userId });
  await updateDraft(db, { id: page.id, contentMd: content, userId });
  if (internal) {
    await setVisibility(db, { id: page.id, visibility: "internal", userId });
  }
  await publishPage(db, { id: page.id, userId });
  return page;
}

describe("reindexPageChunks", () => {
  it("chunks page content and makes it keyword-searchable", async () => {
    const page = await published(
      "Webhooks",
      "Configure a callback URL and we POST signed events to it.",
    );
    await reindexPageChunks(db, {
      pageId: page.id,
      content: "Configure a callback URL and we POST signed events to it.",
    });

    const hits = await searchPageChunks(db, {
      query: "callback URL",
      includeInternal: true,
      limit: 5,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].pageId).toBe(page.id);
    expect(hits[0].content).toContain("callback URL");
    expect(hits[0].path).toBe(page.path);
  });

  it("replaces prior chunks when re-run (no duplicates/stale content)", async () => {
    const page = await published("P", "original content here");
    await reindexPageChunks(db, { pageId: page.id, content: "original apple" });
    await reindexPageChunks(db, { pageId: page.id, content: "replaced banana" });

    const apple = await searchPageChunks(db, {
      query: "apple",
      includeInternal: true,
    });
    const banana = await searchPageChunks(db, {
      query: "banana",
      includeInternal: true,
    });
    expect(apple).toHaveLength(0);
    expect(banana).toHaveLength(1);
  });
});

describe("searchPageChunks visibility", () => {
  it("hides internal-page chunks from anonymous callers", async () => {
    const internal = await published(
      "Secret Ops",
      "The zebra deployment runbook lives here.",
      true,
    );
    await reindexPageChunks(db, {
      pageId: internal.id,
      content: "The zebra deployment runbook lives here.",
    });

    const anon = await searchPageChunks(db, {
      query: "zebra",
      includeInternal: false,
    });
    expect(anon).toHaveLength(0);

    const team = await searchPageChunks(db, {
      query: "zebra",
      includeInternal: true,
    });
    expect(team).toHaveLength(1);
  });
});

describe("clearPageChunks", () => {
  it("removes a page's chunks", async () => {
    const page = await published("P", "findable content");
    await reindexPageChunks(db, {
      pageId: page.id,
      content: "findable content",
    });
    await clearPageChunks(db, page.id);
    const hits = await searchPageChunks(db, {
      query: "findable",
      includeInternal: true,
    });
    expect(hits).toHaveLength(0);
  });
});
