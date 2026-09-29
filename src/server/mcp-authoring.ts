import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { pages, type Page } from "@/db/schema";
import { normalizePagePath } from "@/lib/page-path";
import { PAGE_ICONS } from "@/lib/page-icons";
import * as tree from "@/server/pages/tree";
import { insertRevision } from "@/server/pages/revisions";
import { activeEditors } from "@/server/presence";
import { extensionFor, storeImage, UploadError, type BlobPut } from "@/server/uploads";

// Draft authoring for write-enabled MCP API keys. Everything here edits the
// DRAFT (working copy) only — publishing stays a human step in the editor.

/** A user-facing failure; the MCP tool returns the message as an error. */
export class AuthoringError extends Error {}

/** The key's owner (writes are attributed to them) + optional blob override for tests. */
export type Author = { userId: string; put?: BlobPut };

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const DATA_URI_RE = /data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;
const MD_IMAGE_RE = /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const HTML_IMG_RE = /<img\b[^>]*?\ssrc=["']([^"']+)["']/gi;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Split markdown into alternating prose / fenced-code segments so image
 * handling never rewrites examples inside code blocks.
 */
function splitFences(md: string): { text: string; code: boolean }[] {
  const out: { text: string; code: boolean }[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  const flush = (code: boolean) => {
    if (buf.length) out.push({ text: buf.join("\n"), code });
    buf = [];
  };
  for (const line of md.split("\n")) {
    const m = line.match(FENCE_RE);
    if (fence === null && m) {
      flush(false);
      fence = m[1][0];
      buf.push(line);
    } else if (fence !== null && m && m[1][0] === fence) {
      buf.push(line);
      flush(true);
      fence = null;
    } else {
      buf.push(line);
    }
  }
  flush(fence !== null);
  return out;
}

/**
 * Upload every inline base64 image (data: URI) in the markdown to blob
 * storage — the same place editor uploads go — and swap in the hosted URL.
 * Local file references (./img.png, /Users/…) can't be read server-side, so
 * they're rejected with a message telling the client to upload them first.
 */
export async function ingestMarkdownImages(
  db: Db,
  markdown: string,
  author: Author,
): Promise<{ markdown: string; uploaded: number }> {
  const segments = splitFences(markdown);

  const unresolved = new Set<string>();
  for (const seg of segments) {
    if (seg.code) continue;
    for (const re of [MD_IMAGE_RE, HTML_IMG_RE]) {
      for (const m of seg.text.matchAll(re)) {
        if (!/^(https?:|data:)/i.test(m[1])) unresolved.add(m[1]);
      }
    }
  }
  if (unresolved.size > 0) {
    throw new AuthoringError(
      `These image references point at local files the docs server can't read: ${[...unresolved].join(", ")}. ` +
        "Upload each one first (upload_image tool, or POST it to /api/upload with the API key) and use the returned URL in the markdown.",
    );
  }

  const cache = new Map<string, string>();
  let uploaded = 0;
  for (const seg of segments) {
    if (seg.code) continue;
    const matches = [...seg.text.matchAll(DATA_URI_RE)];
    for (const [uri, type, base64] of matches) {
      if (cache.has(uri)) continue;
      const contentType = type.toLowerCase();
      try {
        const { url } = await storeImage(db, {
          bytes: new Blob([Buffer.from(base64, "base64")], { type: contentType }),
          filename: `image-${cache.size + 1}.${extensionFor(contentType)}`,
          contentType,
          userId: author.userId,
          put: author.put,
        });
        cache.set(uri, url);
        uploaded++;
      } catch (e) {
        if (e instanceof UploadError) throw new AuthoringError(e.message);
        throw e;
      }
    }
    for (const [uri, url] of cache) seg.text = seg.text.replaceAll(uri, url);
  }
  return { markdown: segments.map((s) => s.text).join("\n"), uploaded };
}

export async function uploadImageBase64(
  db: Db,
  opts: { filename: string; contentType: string; dataBase64: string },
  author: Author,
): Promise<{ url: string }> {
  // tolerate a full data: URI being passed as the payload
  const base64 = opts.dataBase64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new AuthoringError("dataBase64 is not valid base64");
  }
  try {
    return await storeImage(db, {
      bytes: new Blob([Buffer.from(base64, "base64")], { type: opts.contentType }),
      filename: opts.filename,
      contentType: opts.contentType,
      userId: author.userId,
      put: author.put,
    });
  } catch (e) {
    if (e instanceof UploadError) throw new AuthoringError(e.message);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export function pageStatus(page: Page): string {
  if (page.publishedContentMd === null) return "draft";
  const changed =
    page.publishedContentMd !== page.contentMd ||
    page.publishedTitle !== page.title;
  return changed ? "published, unpublished changes" : "published";
}

/** Every page (drafts included) as an indented tree for choosing a location. */
export async function listPageTree(db: Db): Promise<string> {
  const rows = await db
    .select()
    .from(pages)
    .orderBy(asc(pages.position), asc(pages.createdAt));
  const ids = new Set(rows.map((r) => r.id));
  const byParent = new Map<string | null, Page[]>();
  for (const row of rows) {
    const key = row.parentId && ids.has(row.parentId) ? row.parentId : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(row);
  }
  const lines: string[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const row of byParent.get(parent) ?? []) {
      const tags = [pageStatus(row)];
      if (row.effectiveVisibility === "internal") tags.push("internal");
      if (row.isHome) tags.push("home");
      lines.push(`${"  ".repeat(depth)}- ${row.title} (${row.path}) [${tags.join(", ")}]`);
      walk(row.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines.join("\n") || "No pages yet.";
}

async function requirePageByPath(db: Db, path: string): Promise<Page> {
  const normalized = normalizePagePath(path);
  if (!normalized) {
    throw new AuthoringError(
      `Invalid page path "${path}". Paths are slug identifiers like "guides/getting-started".`,
    );
  }
  const page = await tree.getPageByPath(db, normalized);
  if (!page) {
    throw new AuthoringError(
      `No page at path "${normalized}". Use list_page_tree to see existing pages.`,
    );
  }
  return page;
}

export async function getDraft(db: Db, path: string) {
  const page = await requirePageByPath(db, path);
  return {
    page,
    status: pageStatus(page),
    text:
      `# ${page.title}\n\n` +
      `path: ${page.path}\nstatus: ${pageStatus(page)}\nvisibility: ${page.effectiveVisibility}\n` +
      `draftUpdatedAt: ${page.draftUpdatedAt.toISOString()}\n\n---\n\n${page.contentMd}`,
  };
}

/** Refuse to write while a person has the page open in the editor. */
async function assertNobodyEditing(db: Db, page: Page) {
  const editors = await activeEditors(db, { pageId: page.id, excludeUserId: "" });
  if (editors.length > 0) {
    throw new AuthoringError(
      `${editors.map((e) => e.userName).join(", ")} ${editors.length === 1 ? "is" : "are"} editing "${page.title}" in the editor right now. ` +
        "Try again once they're done (or ask them to close the page) so their autosave and your changes don't collide.",
    );
  }
}

export async function createDraftPage(
  db: Db,
  opts: {
    title: string;
    content: string;
    parentPath?: string | null;
    position?: number;
    visibility?: "public" | "internal";
    icon?: string | null;
  },
  author: Author,
): Promise<{ page: Page; imagesUploaded: number }> {
  const title = opts.title.trim();
  if (!title) throw new AuthoringError("A title is required");
  if (opts.icon && !(opts.icon in PAGE_ICONS)) {
    throw new AuthoringError(
      `Unknown icon "${opts.icon}". Allowed: ${Object.keys(PAGE_ICONS).join(", ")}`,
    );
  }
  const parent = opts.parentPath ? await requirePageByPath(db, opts.parentPath) : null;
  // upload images before creating anything so a bad image leaves no stub page
  const { markdown, uploaded } = await ingestMarkdownImages(db, opts.content, author);

  const page = await db.transaction(async (tx) => {
    const created = await tree.createPage(tx, {
      title,
      parentId: parent?.id ?? null,
      userId: author.userId,
    });
    await tx
      .update(pages)
      .set({
        contentMd: markdown,
        icon: opts.icon ?? null,
        updatedBy: author.userId,
      })
      .where(eq(pages.id, created.id));
    return created;
  });

  if (opts.position !== undefined) {
    await tree.movePage(db, {
      id: page.id,
      newParentId: parent?.id ?? null,
      newIndex: opts.position,
      userId: author.userId,
    });
  }
  if (opts.visibility) {
    await tree.setVisibility(db, {
      id: page.id,
      visibility: opts.visibility,
      userId: author.userId,
    });
  }
  return { page: (await tree.getPage(db, page.id))!, imagesUploaded: uploaded };
}

export async function updateDraftPage(
  db: Db,
  opts: {
    path: string;
    title?: string;
    content?: string;
    expectedDraftUpdatedAt?: string;
  },
  author: Author,
): Promise<{ page: Page; imagesUploaded: number }> {
  if (opts.title === undefined && opts.content === undefined) {
    throw new AuthoringError("Nothing to update — pass a title and/or content");
  }
  const page = await requirePageByPath(db, opts.path);
  await assertNobodyEditing(db, page);

  let base: Date | undefined;
  if (opts.expectedDraftUpdatedAt) {
    base = new Date(opts.expectedDraftUpdatedAt);
    if (Number.isNaN(base.getTime())) {
      throw new AuthoringError("expectedDraftUpdatedAt must be an ISO timestamp");
    }
  }

  const ingested =
    opts.content !== undefined
      ? await ingestMarkdownImages(db, opts.content, author)
      : undefined;

  try {
    await db.transaction(async (tx) => {
      // checkpoint the previous draft so the change can be undone from History
      await insertRevision(tx, {
        pageId: page.id,
        title: page.title,
        contentMd: page.contentMd,
        kind: "manual",
        userId: author.userId,
      });
      await tree.updateDraft(tx, {
        id: page.id,
        title: opts.title?.trim() || undefined,
        contentMd: ingested?.markdown,
        userId: author.userId,
        baseDraftUpdatedAt: base,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === tree.DRAFT_CONFLICT) {
      throw new AuthoringError(
        "The draft changed since you read it. Call get_draft again, merge your edits into the current content, and retry.",
      );
    }
    throw e;
  }
  return {
    page: (await tree.getPage(db, page.id))!,
    imagesUploaded: ingested?.uploaded ?? 0,
  };
}
