import type { Db } from "@/db";
import { assets } from "@/db/schema";

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Thrown for bad input; `status` maps onto the HTTP response. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Writes bytes to storage and returns the public URL + pathname. */
export type BlobPut = (
  pathname: string,
  body: Blob,
) => Promise<{ url: string; pathname: string }>;

async function vercelBlobPut(pathname: string, body: Blob) {
  const { put } = await import("@vercel/blob");
  return put(pathname, body, { access: "public", addRandomSuffix: true });
}

/**
 * Store an image exactly the way the editor's uploads are stored: Vercel
 * Blob under uploads/, recorded in the asset table. Shared by /api/upload
 * (editor + keyed curl) and the MCP authoring tools.
 */
export async function storeImage(
  db: Db,
  opts: {
    bytes: Blob;
    filename: string;
    contentType: string;
    userId: string | null;
    put?: BlobPut;
  },
): Promise<{ url: string }> {
  if (!ALLOWED_IMAGE_TYPES.has(opts.contentType)) {
    throw new UploadError(`Unsupported file type: ${opts.contentType}`, 415);
  }
  if (opts.bytes.size === 0) {
    throw new UploadError("File is empty", 400);
  }
  if (opts.bytes.size > MAX_IMAGE_BYTES) {
    throw new UploadError("File too large (max 10MB)", 413);
  }
  // keep names path-safe: the blob pathname is built from it
  const filename =
    opts.filename
      .split(/[\\/]/)
      .pop()!
      .replace(/[^\w.-]+/g, "-")
      .replace(/^[.-]+/, "")
      .slice(0, 120) || "image";

  const blob = await (opts.put ?? vercelBlobPut)(`uploads/${filename}`, opts.bytes);
  await db.insert(assets).values({
    blobUrl: blob.url,
    pathname: blob.pathname,
    filename,
    contentType: opts.contentType,
    sizeBytes: opts.bytes.size,
    uploadedBy: opts.userId,
  });
  return { url: blob.url };
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

export function extensionFor(contentType: string): string {
  return EXT_BY_TYPE[contentType] ?? "bin";
}

/**
 * The declared type when it's a supported image, else a guess from the file
 * extension — curl and some clients send application/octet-stream.
 */
export function resolveImageType(declared: string, filename: string): string {
  if (ALLOWED_IMAGE_TYPES.has(declared)) return declared;
  const ext = filename.toLowerCase().match(/\.(\w+)$/)?.[1];
  const byExt: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  };
  return (ext && byExt[ext]) || declared;
}
