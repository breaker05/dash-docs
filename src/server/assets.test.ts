import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { assets, users } from "@/db/schema";
import { createPage, updateDraft } from "./pages/tree";
import { publishPage } from "./pages/publish";
import { PDF_LOGO_KEY, setSetting } from "./settings";
import { AssetInUseError, deleteAssets, listAssetsWithUsage } from "./assets";

let db: Db;
let close: () => Promise<void>;
let userId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await db
    .insert(users)
    .values({ email: "t@dashmarketing.io", name: "Tess", role: "admin" })
    .returning();
  userId = u.id;
});

afterEach(async () => {
  await close();
});

async function addAsset(name: string) {
  const url = `https://x.public.blob.vercel-storage.com/uploads/${name}`;
  const [row] = await db
    .insert(assets)
    .values({
      blobUrl: url,
      pathname: `uploads/${name}`,
      filename: name,
      contentType: "image/png",
      sizeBytes: 100,
      uploadedBy: userId,
    })
    .returning();
  return row;
}

describe("listAssetsWithUsage", () => {
  it("reports draft, published, history-only, settings and unused", async () => {
    const live = await addAsset("live.png");
    const draftOnly = await addAsset("draft.png");
    const old = await addAsset("old.png");
    const logo = await addAsset("logo.png");
    const orphan = await addAsset("orphan.png");

    const page = await createPage(db, { title: "Guide", userId });
    await updateDraft(db, {
      id: page.id,
      contentMd: `![](${live.blobUrl})\n\n![](${old.blobUrl})`,
      userId,
    });
    await publishPage(db, { id: page.id, userId });
    // old.png dropped from the page after publishing; only history has it now
    await updateDraft(db, {
      id: page.id,
      contentMd: `![](${live.blobUrl})\n\n![](${draftOnly.blobUrl})`,
      userId,
    });
    await publishPage(db, { id: page.id, userId });
    await updateDraft(db, {
      id: page.id,
      contentMd: `![](${live.blobUrl})`,
      userId,
    });
    await setSetting(db, { key: PDF_LOGO_KEY, value: logo.blobUrl, userId });

    const byName = Object.fromEntries(
      (await listAssetsWithUsage(db)).map((a) => [a.filename, a]),
    );

    expect(byName["live.png"].status).toBe("in-use");
    expect(byName["live.png"].uploadedByName).toBe("Tess");
    expect(byName["live.png"].pages).toEqual([
      expect.objectContaining({
        pageId: page.id,
        title: "Guide",
        inDraft: true,
        inPublished: true,
      }),
    ]);

    expect(byName["draft.png"].status).toBe("in-use");
    expect(byName["draft.png"].pages[0]).toMatchObject({
      inDraft: false,
      inPublished: true,
    });

    expect(byName["old.png"].status).toBe("history");
    expect(byName["old.png"].pages).toEqual([]);
    expect(byName["old.png"].historyPageCount).toBe(1);

    expect(byName["logo.png"].status).toBe("in-use");
    expect(byName["logo.png"].settingKeys).toEqual([PDF_LOGO_KEY]);

    expect(byName["orphan.png"].status).toBe("unused");
    expect(orphan.id).toBe(byName["orphan.png"].id);
  });
});

describe("deleteAssets", () => {
  it("deletes unused and history-only assets from blob + table", async () => {
    const orphan = await addAsset("orphan.png");
    const deletedUrls: string[] = [];
    const out = await deleteAssets(db, [orphan.id], {
      del: async (urls) => {
        deletedUrls.push(...urls);
      },
    });
    expect(out.deleted).toBe(1);
    expect(deletedUrls).toEqual([orphan.blobUrl]);
    expect(await db.select().from(assets)).toHaveLength(0);
  });

  it("refuses the whole batch if any asset is in use", async () => {
    const orphan = await addAsset("orphan.png");
    const used = await addAsset("used.png");
    const page = await createPage(db, { title: "Guide", userId });
    await updateDraft(db, {
      id: page.id,
      contentMd: `<img src="${used.blobUrl}">`,
      userId,
    });

    let called = false;
    await expect(
      deleteAssets(db, [orphan.id, used.id], {
        del: async () => {
          called = true;
        },
      }),
    ).rejects.toBeInstanceOf(AssetInUseError);
    expect(called).toBe(false);
    expect(await db.select().from(assets)).toHaveLength(2);
  });
});
