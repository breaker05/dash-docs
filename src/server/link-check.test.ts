import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { redirects, users } from "@/db/schema";
import { createPage, updateDraft } from "./pages/tree";
import { publishPage } from "./pages/publish";
import {
  extractInternalLinks,
  findBrokenLinks,
  normalizeLinkTarget,
} from "./link-check";

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

describe("extractInternalLinks / normalizeLinkTarget", () => {
  it("finds site-relative markdown links only", () => {
    const md =
      "[a](/guides/x) [b](https://ex.com/y) [c](/API/Z.html#frag) [d](//cdn.com/z) [e](#anchor)";
    expect(extractInternalLinks(md)).toEqual(["/guides/x", "/API/Z.html#frag"]);
    expect(normalizeLinkTarget("/API/Z.html#frag")).toBe("api/z");
    expect(normalizeLinkTarget("/guides/x?v=1")).toBe("guides/x");
    expect(normalizeLinkTarget("/")).toBe("");
  });
});

describe("findBrokenLinks", () => {
  it("flags unresolvable targets, accepts paths and redirects", async () => {
    const target = await createPage(db, {
      title: "Target Page",
      parentId: null,
      userId,
    });
    await db
      .insert(redirects)
      .values({ fromPath: "old_target", toPageId: target.id });

    const source = await createPage(db, {
      title: "Source",
      parentId: null,
      userId,
    });
    await updateDraft(db, {
      id: source.id,
      contentMd: [
        `[ok](/${target.path})`,
        "[ok-redirect](/old_target)",
        "[ok-home](/)",
        "[ok-reserved](/search?q=x)",
        "[skip-asset](/dash-customer-import.postman_collection.json)",
        "[skip-html](/security-overview.html)",
        "[broken-md](/nope.md)",
        "[broken](/nowhere/at-all)",
      ].join("\n\n"),
      userId,
    });
    await publishPage(db, { id: source.id, userId });

    const broken = await findBrokenLinks(db);
    expect(broken.map((b) => [b.href, b.in])).toEqual([
      ["/nope.md", "draft"],
      ["/nowhere/at-all", "draft"],
      ["/nope.md", "published"],
      ["/nowhere/at-all", "published"],
    ]);
    expect(broken[0].pagePath).toBe(source.path);
  });
});
