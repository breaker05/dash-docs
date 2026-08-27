import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { contextChunks, contextDocs } from "@/db/schema";
import { chunkText } from "@/lib/chunk-text";
import { chunkOpenApi } from "@/lib/openapi-chunk";
import {
  getEmbeddingProvider,
  toVectorLiteral,
  type EmbeddingProvider,
} from "@/server/embeddings";

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
  // OpenAPI/Swagger specs chunk per-endpoint so retrieval lands coherent
  // hits; everything else (and unparseable specs) falls back to size-based.
  const chunks = chunkOpenApi(content) ?? chunkText(content);

  const result = await db.transaction(async (tx) => {
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

  // Semantic index (Neon-only). No-op until an embedding provider is wired:
  // the pgvector `embedding` column lives on Neon (see scripts/pgvector-setup.sql),
  // not in the Drizzle schema, so this path is skipped in the PGlite test DB.
  const embedder = getEmbeddingProvider();
  if (embedder && chunks.length > 0) {
    await embedDocChunks(db, result.id, chunks, embedder);
  }
  return result;
}

/**
 * Embed a doc's chunks and store the vectors on `context_chunk.embedding`
 * (raw SQL — the column exists only on Neon). Chunk `ord` equals the index in
 * `chunks`, so vectors map back by ordinal. Runs only when a provider is
 * configured; embedding failures throw and abort the upload.
 */
async function embedDocChunks(
  db: Db,
  docId: string,
  chunks: string[],
  embedder: EmbeddingProvider,
): Promise<void> {
  const BATCH = 128;
  for (let start = 0; start < chunks.length; start += BATCH) {
    const slice = chunks.slice(start, start + BATCH);
    const vectors = await embedder.embed(slice);
    await Promise.all(
      vectors.map((vec, i) =>
        db.execute(sql`
          update ${contextChunks}
          set embedding = ${toVectorLiteral(vec)}::vector
          where ${contextChunks.docId} = ${docId}
            and ${contextChunks.ord} = ${start + i}
        `),
      ),
    );
  }
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

/**
 * Semantic search over context-file chunks by embedding cosine distance
 * (pgvector `<=>`). Raw SQL because the `embedding` column lives only on Neon,
 * not in the Drizzle schema. Only returns rows that have been embedded; callers
 * fuse these with `searchContextChunks` (keyword) via reciprocal rank fusion.
 */
export async function searchContextChunksByVector(
  db: Db,
  opts: { embedding: number[]; includeInternal: boolean; limit?: number },
): Promise<ContextChunkHit[]> {
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20);
  const vec = toVectorLiteral(opts.embedding);
  const res = (await db.execute(sql`
    select c.doc_id as "docId", d.name as "docName", c.ord as "ord",
           c.content as "content"
    from context_chunk c
    join context_doc d on d.id = c.doc_id
    where d.enabled = true
      and (${opts.includeInternal} or d.audience = 'public')
      and c.embedding is not null
    order by c.embedding <=> ${vec}::vector
    limit ${limit}
  `)) as unknown as ContextChunkHit[] | { rows: ContextChunkHit[] };
  return Array.isArray(res) ? res : res.rows;
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
