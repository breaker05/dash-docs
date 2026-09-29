import { desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { assets, pageRevisions, pages, settings, users } from "@/db/schema";

export type AssetPageUsage = {
  pageId: string;
  title: string;
  path: string;
  isHome: boolean;
  inDraft: boolean;
  inPublished: boolean;
};

/**
 * - in-use: referenced by a page's current draft or published content, or by
 *   a setting (e.g. the PDF logo). Deleting would break something visible.
 * - history: only old revisions reference it — restoring one would show a
 *   broken image, but nothing current does.
 * - unused: referenced nowhere.
 */
export type AssetStatus = "in-use" | "history" | "unused";

export type AssetWithUsage = {
  id: string;
  blobUrl: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedByName: string | null;
  pages: AssetPageUsage[];
  historyPageCount: number;
  settingKeys: string[];
  status: AssetStatus;
};

/** Thrown when deleting an asset something current still references. */
export class AssetInUseError extends Error {}

// References are found by the blob URL appearing anywhere in the text: the
// editor, MCP authoring and settings all store the exact URL storeImage
// returned. strpos rather than LIKE so `%`/`_` in URLs aren't wildcards.
const contains = (haystack: unknown, needle: unknown) =>
  sql`strpos(${haystack}, ${needle}) > 0`;

/**
 * Every uploaded image with where it's referenced, newest first. Pass `ids`
 * to scope the lookup (used before deleting).
 */
export async function listAssetsWithUsage(
  db: Db,
  opts: { ids?: string[] } = {},
): Promise<AssetWithUsage[]> {
  const scope = opts.ids ? inArray(assets.id, opts.ids) : undefined;
  if (opts.ids?.length === 0) return [];

  const [rows, pageRefs, historyRefs, settingRefs] = await Promise.all([
    db
      .select({
        id: assets.id,
        blobUrl: assets.blobUrl,
        filename: assets.filename,
        contentType: assets.contentType,
        sizeBytes: assets.sizeBytes,
        createdAt: assets.createdAt,
        uploadedByName: sql<string | null>`coalesce(${users.name}, ${users.email})`,
      })
      .from(assets)
      .leftJoin(users, eq(users.id, assets.uploadedBy))
      .where(scope)
      .orderBy(desc(assets.createdAt)),
    db
      .select({
        assetId: assets.id,
        pageId: pages.id,
        title: pages.title,
        path: pages.path,
        isHome: pages.isHome,
        inDraft: sql<boolean>`${contains(pages.contentMd, assets.blobUrl)}`,
        inPublished: sql<boolean>`coalesce(${contains(pages.publishedContentMd, assets.blobUrl)}, false)`,
      })
      .from(assets)
      .innerJoin(
        pages,
        sql`${contains(pages.contentMd, assets.blobUrl)} or coalesce(${contains(pages.publishedContentMd, assets.blobUrl)}, false)`,
      )
      .where(scope)
      .orderBy(pages.path),
    db
      .select({
        assetId: assets.id,
        pageCount: sql<number>`count(distinct ${pageRevisions.pageId})::int`,
      })
      .from(assets)
      .innerJoin(
        pageRevisions,
        contains(pageRevisions.contentMd, assets.blobUrl),
      )
      .where(scope)
      .groupBy(assets.id),
    db
      .select({ assetId: assets.id, key: settings.key })
      .from(assets)
      .innerJoin(settings, contains(settings.value, assets.blobUrl))
      .where(scope),
  ]);

  return rows.map((row) => {
    const refs = pageRefs.filter((r) => r.assetId === row.id);
    const settingKeys = settingRefs
      .filter((r) => r.assetId === row.id)
      .map((r) => r.key);
    const historyPageCount =
      historyRefs.find((r) => r.assetId === row.id)?.pageCount ?? 0;
    const status: AssetStatus =
      refs.length > 0 || settingKeys.length > 0
        ? "in-use"
        : historyPageCount > 0
          ? "history"
          : "unused";
    return {
      ...row,
      pages: refs.map((r) => ({
        pageId: r.pageId,
        title: r.title,
        path: r.path,
        isHome: r.isHome,
        inDraft: r.inDraft,
        inPublished: r.inPublished,
      })),
      historyPageCount,
      settingKeys,
      status,
    };
  });
}

/** Removes a blob from storage; injectable for tests. */
export type BlobDelete = (urls: string[]) => Promise<void>;

async function vercelBlobDelete(urls: string[]) {
  const { del } = await import("@vercel/blob");
  await del(urls);
}

/**
 * Delete images from storage and the asset table. Refuses (deleting nothing)
 * if any is still referenced by a current draft, published page or setting;
 * history-only references are allowed — the caller has warned about them.
 */
export async function deleteAssets(
  db: Db,
  ids: string[],
  opts: { del?: BlobDelete } = {},
): Promise<{ deleted: number }> {
  const targets = await listAssetsWithUsage(db, { ids });
  const inUse = targets.filter((a) => a.status === "in-use");
  if (inUse.length > 0) {
    throw new AssetInUseError(
      `Still in use: ${inUse.map((a) => a.filename).join(", ")}`,
    );
  }
  if (targets.length === 0) return { deleted: 0 };

  await (opts.del ?? vercelBlobDelete)(targets.map((a) => a.blobUrl));
  await db.delete(assets).where(
    inArray(
      assets.id,
      targets.map((a) => a.id),
    ),
  );
  return { deleted: targets.length };
}
