import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { contextChunks, contextDocs } from "@/db/schema";
import { chunkText } from "@/lib/chunk-text";

export const MAX_CONTEXT_DOC_BYTES = 2 * 1024 * 1024;

/**
 * Create or replace (by name) a context file: stores the full content on
 * the doc row and re-chunks it for retrieval in one transaction.
 */
export async function createContextDoc(
  db: Db,
  opts: {
    name: string;
    filename: string;
    contentType: string;
    content: string;
    userId: string;
  },
): Promise<{ id: string; chunkCount: number }> {
  const name = opts.name.trim();
  if (name === "") throw new Error("Name is required");
  const content = opts.content.replace(/\u0000/g, "");
  const bytes = Buffer.byteLength(content, "utf8");
  if (content.trim() === "") throw new Error("File is empty");
  if (bytes > MAX_CONTEXT_DOC_BYTES) {
    throw new Error("File too large (max 2MB)");
  }
  const chunks = chunkText(content);

  return db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(contextDocs)
      .values({
        name,
        filename: opts.filename,
        contentType: opts.contentType,
        bytes,
        content,
        updatedBy: opts.userId,
      })
      .onConflictDoUpdate({
        target: contextDocs.name,
        set: {
          filename: opts.filename,
          contentType: opts.contentType,
          bytes,
          content,
          updatedBy: opts.userId,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: contextDocs.id });
    await tx.delete(contextChunks).where(eq(contextChunks.docId, doc.id));
    if (chunks.length > 0) {
      await tx.insert(contextChunks).values(
        chunks.map((content, ord) => ({ docId: doc.id, ord, content })),
      );
    }
    return { id: doc.id, chunkCount: chunks.length };
  });
}

export async function listContextDocs(db: Db) {
  return db
    .select({
      id: contextDocs.id,
      name: contextDocs.name,
      filename: contextDocs.filename,
      contentType: contextDocs.contentType,
      bytes: contextDocs.bytes,
      audience: contextDocs.audience,
      enabled: contextDocs.enabled,
      updatedAt: contextDocs.updatedAt,
      chunkCount: sql<number>`count(${contextChunks.id})::int`,
    })
    .from(contextDocs)
    .leftJoin(contextChunks, eq(contextChunks.docId, contextDocs.id))
    .groupBy(contextDocs.id)
    .orderBy(asc(contextDocs.name));
}

export async function deleteContextDoc(db: Db, id: string): Promise<void> {
  await db.delete(contextDocs).where(eq(contextDocs.id, id));
}

export async function setContextDocEnabled(
  db: Db,
  opts: { id: string; enabled: boolean; userId: string },
): Promise<void> {
  await db
    .update(contextDocs)
    .set({ enabled: opts.enabled, updatedBy: opts.userId })
    .where(eq(contextDocs.id, opts.id));
}

export async function setContextDocAudience(
  db: Db,
  opts: { id: string; audience: "public" | "internal"; userId: string },
): Promise<void> {
  await db
    .update(contextDocs)
    .set({ audience: opts.audience, updatedBy: opts.userId })
    .where(eq(contextDocs.id, opts.id));
}

export type ContextChunkHit = {
  docId: string;
  docName: string;
  ord: number;
  content: string;
};

/**
 * Full-text search over context-file chunks — the Ask AI retrieval side.
 * Internal-audience files require `includeInternal` (a signed-in session).
 */
export async function searchContextChunks(
  db: Db,
  opts: { query: string; includeInternal: boolean; limit?: number },
): Promise<ContextChunkHit[]> {
  const query = opts.query.trim().slice(0, 200);
  if (!query) return [];
  const limit = Math.min(Math.max(opts.limit ?? 3, 1), 10);

  return db
    .select({
      docId: contextChunks.docId,
      docName: contextDocs.name,
      ord: contextChunks.ord,
      content: contextChunks.content,
    })
    .from(contextChunks)
    .innerJoin(contextDocs, eq(contextDocs.id, contextChunks.docId))
    .where(
      and(
        eq(contextDocs.enabled, true),
        opts.includeInternal
          ? sql`true`
          : eq(contextDocs.audience, "public"),
        sql`${contextChunks.search} @@ websearch_to_tsquery('english', ${query})`,
      ),
    )
    .orderBy(
      desc(
        sql`ts_rank_cd(${contextChunks.search}, websearch_to_tsquery('english', ${query}))`,
      ),
    )
    .limit(limit);
}

/** Enabled context files for keyed MCP clients. */
export async function listContextDocsForMcp(db: Db) {
  return db
    .select({
      name: contextDocs.name,
      filename: contextDocs.filename,
      contentType: contextDocs.contentType,
      bytes: contextDocs.bytes,
      audience: contextDocs.audience,
    })
    .from(contextDocs)
    .where(eq(contextDocs.enabled, true))
    .orderBy(asc(contextDocs.name));
}

export async function getContextDocByName(db: Db, name: string) {
  const [doc] = await db
    .select({
      name: contextDocs.name,
      filename: contextDocs.filename,
      contentType: contextDocs.contentType,
      content: contextDocs.content,
    })
    .from(contextDocs)
    .where(
      and(
        eq(contextDocs.enabled, true),
        sql`lower(${contextDocs.name}) = ${name.trim().toLowerCase()}`,
      ),
    );
  return doc ?? null;
}
