import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import { createPage } from "./pages/tree";
import {
  createTag,
  deleteTag,
  getPageTagIds,
  getPageIdsForTag,
  getPublicTags,
  getTagPages,
  getTagsForPage,
  setPageTags,
} from "./tags";
import { setUserRole } from "./users";
import { updateDraft, setVisibility } from "./pages/tree";
import { publishPage } from "./pages/publish";

let db: Db;
let close: () => Promise<void>;
let userId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await db
    .insert(users)
    .values({ email: "a@dashmarketing.io", role: "admin" })
    .returning();
  userId = u.id;
});

afterEach(async () => {
  await close();
});

describe("tags", () => {
  it("creates, assigns, filters, and cascades on delete", async () => {
    const page = await createPage(db, { title: "Guide", userId });
    const tag = await createTag(db, "Lead API");
    expect(tag.slug).toBe("lead-api");

    // creating the same name again returns the existing tag
    const dup = await createTag(db, "Lead API");
    expect(dup.id).toBe(tag.id);

    await setPageTags(db, { pageId: page.id, tagIds: [tag.id] });
    expect(await getPageTagIds(db, page.id)).toEqual([tag.id]);
    expect(await getPageIdsForTag(db, "lead-api")).toEqual([page.id]);

    await deleteTag(db, tag.id);
    expect(await getPageTagIds(db, page.id)).toEqual([]);
  });
});

describe("public tag queries", () => {
  it("lists tags with visible-page counts, hiding internal from anon", async () => {
    const pub = await createPage(db, { title: "Lead API", userId });
    const internal = await createPage(db, { title: "PTO", userId });
    const draft = await createPage(db, { title: "Draft", userId });
    await updateDraft(db, { id: pub.id, contentMd: "x", userId });
    await updateDraft(db, { id: internal.id, contentMd: "y", userId });
    await setVisibility(db, { id: internal.id, visibility: "internal", userId });
    await publishPage(db, { id: pub.id, userId });
    await publishPage(db, { id: internal.id, userId });

    const api = await createTag(db, "API");
    const hr = await createTag(db, "HR");
    await setPageTags(db, { pageId: pub.id, tagIds: [api.id] });
    await setPageTags(db, { pageId: internal.id, tagIds: [api.id, hr.id] });
    await setPageTags(db, { pageId: draft.id, tagIds: [api.id] });

    // anon: only the public published page counts; HR disappears entirely
    const anon = await getPublicTags(db, false);
    expect(anon).toEqual([
      expect.objectContaining({ slug: "api", count: 1 }),
    ]);

    // team: internal pages count too
    const team = await getPublicTags(db, true);
    expect(team.find((t) => t.slug === "api")?.count).toBe(2);
    expect(team.find((t) => t.slug === "hr")?.count).toBe(1);

    // browse pages under a tag
    const anonPages = await getTagPages(db, "api", false);
    expect(anonPages?.pages.map((p) => p.title)).toEqual(["Lead API"]);
    const teamPages = await getTagPages(db, "api", true);
    expect(teamPages?.pages).toHaveLength(2);

    // unknown tag or nothing visible → null
    expect(await getTagPages(db, "hr", false)).toBeNull();
    expect(await getTagPages(db, "nope", true)).toBeNull();

    // chips for an article
    const chips = await getTagsForPage(db, pub.id);
    expect(chips.map((t) => t.slug)).toEqual(["api"]);
  });
});

describe("setUserRole", () => {
  it("promotes and demotes, but refuses to demote the last admin", async () => {
    const [editor] = await db
      .insert(users)
      .values({ email: "b@dashmarketing.io" })
      .returning();

    await setUserRole(db, { userId: editor.id, role: "admin" });
    await setUserRole(db, { userId, role: "editor" }); // ok: editor is admin now
    await expect(
      setUserRole(db, { userId: editor.id, role: "editor" }),
    ).rejects.toThrow(/last admin/i);
  });
});
