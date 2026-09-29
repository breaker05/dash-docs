import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { assets, pageRevisions, pages, users } from "@/db/schema";
import { createPage } from "./pages/tree";
import { publishPage } from "./pages/publish";
import { heartbeat } from "./presence";
import {
  AuthoringError,
  createDraftPage,
  getDraft,
  ingestMarkdownImages,
  listPageTree,
  updateDraftPage,
  uploadImageBase64,
  type Author,
} from "./mcp-authoring";

let db: Db;
let close: () => Promise<void>;
let author: Author;
let putCalls: string[];

// 1x1 transparent PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await db
    .insert(users)
    .values({ email: "t@dashmarketing.io", role: "admin" })
    .returning();
  putCalls = [];
  author = {
    userId: u.id,
    put: async (pathname) => {
      putCalls.push(pathname);
      return {
        url: `https://blob.test/${pathname}-${putCalls.length}`,
        pathname,
      };
    },
  };
});

afterEach(async () => {
  await close();
});

describe("ingestMarkdownImages", () => {
  it("uploads inline base64 images once and swaps in hosted URLs", async () => {
    const uri = `data:image/png;base64,${PNG_B64}`;
    const md = `![a](${uri})\n\ntext\n\n<img src="${uri}" alt="b">`;
    const out = await ingestMarkdownImages(db, md, author);
    expect(out.uploaded).toBe(1);
    expect(out.markdown).not.toContain("data:");
    expect(out.markdown).toContain("![a](https://blob.test/uploads/image-1.png-1)");
    expect(putCalls).toEqual(["uploads/image-1.png"]);
    const rows = await db.select().from(assets);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ contentType: "image/png", uploadedBy: author.userId });
  });

  it("leaves hosted URLs and code-block examples alone", async () => {
    const md = [
      "![ok](https://example.com/x.png)",
      "```md",
      "![example](./local.png)",
      `![inline](data:image/png;base64,${PNG_B64})`,
      "```",
    ].join("\n");
    const out = await ingestMarkdownImages(db, md, author);
    expect(out).toEqual({ markdown: md, uploaded: 0 });
  });

  it("rejects local file references with upload instructions", async () => {
    await expect(
      ingestMarkdownImages(db, "![shot](./docs/shot.png)", author),
    ).rejects.toThrow(/\.\/docs\/shot\.png.*upload_image/);
  });

  it("rejects unsupported image types", async () => {
    await expect(
      ingestMarkdownImages(db, `![x](data:image/bmp;base64,${PNG_B64})`, author),
    ).rejects.toBeInstanceOf(AuthoringError);
  });
});

describe("uploadImageBase64", () => {
  it("stores bytes, accepting a full data URI too", async () => {
    const { url } = await uploadImageBase64(
      db,
      { filename: "../../evil name.png", contentType: "image/png", dataBase64: `data:image/png;base64,${PNG_B64}` },
      author,
    );
    expect(url).toMatch(/^https:\/\/blob\.test\/uploads\/evil-name\.png/);
  });

  it("rejects non-base64 payloads", async () => {
    await expect(
      uploadImageBase64(db, { filename: "a.png", contentType: "image/png", dataBase64: "not base64!" }, author),
    ).rejects.toThrow(/base64/);
  });
});

describe("createDraftPage", () => {
  it("creates an unpublished draft under a parent, at a position", async () => {
    const guides = await createPage(db, { title: "Guides", userId: author.userId });
    await createPage(db, { title: "First", parentId: guides.id, userId: author.userId });

    const { page } = await createDraftPage(
      db,
      {
        title: "Webhooks",
        content: "# Hello",
        parentPath: "guides",
        position: 0,
        icon: "webhook",
        visibility: "internal",
      },
      author,
    );
    expect(page).toMatchObject({
      path: "guides/webhooks",
      contentMd: "# Hello",
      publishedContentMd: null,
      position: 0,
      icon: "webhook",
      effectiveVisibility: "internal",
      updatedBy: author.userId,
    });
    const tree = await listPageTree(db);
    expect(tree).toBe(
      [
        "- Guides (guides) [draft]",
        "  - Webhooks (guides/webhooks) [draft, internal]",
        "  - First (guides/first) [draft]",
      ].join("\n"),
    );
  });

  it("rejects unknown parents and icons without creating anything", async () => {
    await expect(
      createDraftPage(db, { title: "X", content: "", parentPath: "nope" }, author),
    ).rejects.toThrow(/No page at path "nope"/);
    await expect(
      createDraftPage(db, { title: "X", content: "", icon: "not-an-icon" }, author),
    ).rejects.toThrow(/Unknown icon/);
    await expect(
      createDraftPage(db, { title: "X", content: "![a](img.png)" }, author),
    ).rejects.toThrow(/local files/);
    expect(await db.select().from(pages)).toHaveLength(0);
  });
});

describe("updateDraftPage", () => {
  it("updates the draft only, checkpointing the previous version", async () => {
    const created = await createPage(db, { title: "API", userId: author.userId });
    await db.update(pages).set({ contentMd: "v1" }).where(eq(pages.id, created.id));
    await publishPage(db, { id: created.id, userId: author.userId });

    const { page } = await updateDraftPage(db, { path: "api", content: "v2" }, author);
    expect(page.contentMd).toBe("v2");
    expect(page.publishedContentMd).toBe("v1");

    const draft = await getDraft(db, "api");
    expect(draft.status).toBe("published, unpublished changes");
    expect(draft.text).toContain("v2");

    const revs = await db
      .select()
      .from(pageRevisions)
      .where(eq(pageRevisions.pageId, created.id));
    expect(revs.map((r) => [r.kind, r.contentMd])).toEqual(
      expect.arrayContaining([["publish", "v1"], ["manual", "v1"]]),
    );
  });

  it("rejects stale writes and rolls back the checkpoint", async () => {
    const created = await createPage(db, { title: "API", userId: author.userId });
    await expect(
      updateDraftPage(
        db,
        { path: "api", content: "x", expectedDraftUpdatedAt: "2000-01-01T00:00:00.000Z" },
        author,
      ),
    ).rejects.toThrow(/changed since you read it/);
    const revs = await db
      .select()
      .from(pageRevisions)
      .where(eq(pageRevisions.pageId, created.id));
    expect(revs).toHaveLength(0);
  });

  it("refuses while someone has the page open in the editor", async () => {
    const created = await createPage(db, { title: "API", userId: author.userId });
    await heartbeat(db, { pageId: created.id, userId: author.userId, userName: "Sam" });
    await expect(
      updateDraftPage(db, { path: "api", content: "x" }, author),
    ).rejects.toThrow(/Sam is editing/);
  });
});
