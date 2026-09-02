import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import { createPage, setVisibility, updateDraft } from "./tree";
import { publishPage } from "./publish";
import { getPublishedCorpus } from "./corpus";

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

async function make(title: string, content: string, opts: {
  publish?: boolean;
  internal?: boolean;
} = {}) {
  const page = await createPage(db, { title, userId });
  await updateDraft(db, { id: page.id, contentMd: content, userId });
  if (opts.internal) {
    await setVisibility(db, { id: page.id, visibility: "internal", userId });
  }
  if (opts.publish !== false) await publishPage(db, { id: page.id, userId });
  return page;
}

describe("getPublishedCorpus", () => {
  it("returns only published pages, public-only for anonymous callers", async () => {
    await make("Public Guide", "public body");
    await make("Secret", "internal body", { internal: true });
    await make("Draft", "draft body", { publish: false });

    const anon = await getPublishedCorpus(db, { includeInternal: false });
    expect(anon.map((p) => p.title)).toEqual(["Public Guide"]);
    expect(anon[0].markdown).toBe("public body");

    const team = await getPublishedCorpus(db, { includeInternal: true });
    expect(team.map((p) => p.title).sort()).toEqual(["Public Guide", "Secret"]);
  });

  it("orders deterministically by path (so the prompt cache stays stable)", async () => {
    await make("Zed", "z");
    await make("Alpha", "a");
    const corpus = await getPublishedCorpus(db, { includeInternal: true });
    const paths = corpus.map((p) => p.path);
    expect([...paths]).toEqual([...paths].sort());
  });
});
