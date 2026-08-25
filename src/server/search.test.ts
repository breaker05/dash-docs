import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import { createPage, setVisibility, updateDraft } from "./pages/tree";
import { publishPage } from "./pages/publish";
import { searchPages } from "./search";
import { createTag, setPageTags } from "./tags";

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

async function makePublished(
  title: string,
  content: string,
  internal = false,
) {
  const page = await createPage(db, { title, userId });
  await updateDraft(db, { id: page.id, contentMd: content, userId });
  if (internal) {
    await setVisibility(db, { id: page.id, visibility: "internal", userId });
  }
  await publishPage(db, { id: page.id, userId });
  return page;
}

describe("searchPages", () => {
  it("finds terms inside code blocks", async () => {
    await makePublished(
      "Lead Submission",
      "Use the API:\n\n```bash\ncurl -X POST https://api.dashmarketing.io/lead/submit\n```\n",
    );
    const hits = await searchPages(db, {
      query: "lead submit",
      includeInternal: false,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Lead Submission");
  });

  it("never returns internal pages to anonymous callers", async () => {
    await makePublished("PTO Policy", "Vacation accrual rules", true);
    expect(
      await searchPages(db, { query: "vacation", includeInternal: false }),
    ).toHaveLength(0);
    const authed = await searchPages(db, {
      query: "vacation",
      includeInternal: true,
    });
    expect(authed).toHaveLength(1);
  });

  it("excludes drafts entirely", async () => {
    const page = await createPage(db, { title: "Secret Draft", userId });
    await updateDraft(db, { id: page.id, contentMd: "unreleased feature", userId });
    expect(
      await searchPages(db, { query: "unreleased", includeInternal: true }),
    ).toHaveLength(0);
  });

  it("filters results by tag slug", async () => {
    const lead = await makePublished("Lead Submission", "submit leads here");
    await makePublished("Customer Import", "import your leads data");
    const tag = await createTag(db, "Lead API");
    await setPageTags(db, { pageId: lead.id, tagIds: [tag.id] });

    const all = await searchPages(db, { query: "leads", includeInternal: false });
    expect(all).toHaveLength(2);

    const filtered = await searchPages(db, {
      query: "leads",
      includeInternal: false,
      tagSlug: "lead-api",
    });
    expect(filtered.map((h) => h.title)).toEqual(["Lead Submission"]);

    const none = await searchPages(db, {
      query: "leads",
      includeInternal: false,
      tagSlug: "unknown-tag",
    });
    expect(none).toHaveLength(0);
  });

  it("returns empty for blank queries", async () => {
    expect(await searchPages(db, { query: "  ", includeInternal: false })).toEqual(
      [],
    );
  });
});
