import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { pageChunks, pages } from "@/db/schema";
import { chunkText } from "@/lib/chunk-text";
import {
  getEmbeddingProvider,
  toVectorLiteral,
  type EmbeddingProvider,
} from "@/server/embeddings";

export type PageChunkHit = {
  pageId: string;
  path: string;
  title: string;
  ord: number;
  content: string;
};

/**
 * Rebuild the retrieval chunks for one page: replace its rows with fresh
 * chunks of `content`, then embed them if a provider is configured. Called on
 * publish. Embedding runs after the keyword rows are committed (like context
 * docs) so retrieval works immediately even without semantic search.
 */
export async function reindexPageChunks(
  db: Db,
  opts: { pageId: string; content: string },
): Promise<number> {
  const chunks = chunkText(opts.content);
  await db.transaction(async (tx) => {
    await tx.delete(pageChunks).where(eq(pageChunks.pageId, opts.pageId));
    if (chunks.length > 0) {
      await tx.insert(pageChunks).values(
        chunks.map((content, ord) => ({ pageId: opts.pageId, ord, content })),
      );
    }
  });

  const embedder = getEmbeddingProvider();
  if (embedder && chunks.length > 0) {
    await embedPageChunks(db, opts.pageId, chunks, embedder);
  }
  return chunks.length;
}

/**
 * Embed a page's chunks into `page_chunk.embedding` (raw SQL — the column
 * exists only on Neon). Chunk `ord` equals the index in `chunks`, so vectors
 * map back by ordinal.
 */
async function embedPageChunks(
  db: Db,
  pageId: string,
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
          update ${pageChunks}
          set embedding = ${toVectorLiteral(vec)}::vector
          where ${pageChunks.pageId} = ${pageId}
            and ${pageChunks.ord} = ${start + i}
        `),
      ),
    );
  }
}

export async function clearPageChunks(db: Db, pageId: string): Promise<void> {
  await db.delete(pageChunks).where(eq(pageChunks.pageId, pageId));
}

/**
 * Full-text search over published-page chunks — the Ask AI retrieval side for
 * the docs themselves. Internal pages require `includeInternal` (a signed-in
 * session). Only published pages are searchable.
 */
export async function searchPageChunks(
  db: Db,
  opts: { query: string; includeInternal: boolean; limit?: number },
): Promise<PageChunkHit[]> {
  const query = opts.query.trim().slice(0, 200);
  if (!query) return [];
  const limit = Math.min(Math.max(opts.limit ?? 4, 1), 10);

  return db
    .select({
      pageId: pageChunks.pageId,
      path: pages.path,
      title: pages.publishedTitle,
      ord: pageChunks.ord,
      content: pageChunks.content,
    })
    .from(pageChunks)
    .innerJoin(pages, eq(pages.id, pageChunks.pageId))
    .where(
      and(
        sql`${pages.publishedContentMd} is not null`,
        opts.includeInternal
          ? sql`true`
          : eq(pages.effectiveVisibility, "public"),
        sql`${pageChunks.search} @@ websearch_to_tsquery('english', ${query})`,
      ),
    )
    .orderBy(
      desc(
        sql`ts_rank_cd(${pageChunks.search}, websearch_to_tsquery('english', ${query}))`,
      ),
    )
    .limit(limit)
    .then((rows) => rows.map((r) => ({ ...r, title: r.title ?? "Untitled" })));
}

/**
 * Semantic search over published-page chunks by embedding cosine distance.
 * Raw SQL because the `embedding` column lives only on Neon. Callers fuse these
 * with searchPageChunks (keyword) via reciprocal rank fusion.
 */
export async function searchPageChunksByVector(
  db: Db,
  opts: { embedding: number[]; includeInternal: boolean; limit?: number },
): Promise<PageChunkHit[]> {
  const limit = Math.min(Math.max(opts.limit ?? 4, 1), 10);
  const vec = toVectorLiteral(opts.embedding);
  const res = (await db.execute(sql`
    select c.page_id as "pageId", p.path as "path",
           coalesce(p.published_title, 'Untitled') as "title",
           c.ord as "ord", c.content as "content"
    from page_chunk c
    join page p on p.id = c.page_id
    where p.published_content_md is not null
      and (${opts.includeInternal} or p.effective_visibility = 'public')
      and c.embedding is not null
    order by c.embedding <=> ${vec}::vector
    limit ${limit}
  `)) as unknown as PageChunkHit[] | { rows: PageChunkHit[] };
  return Array.isArray(res) ? res : res.rows;
}
