/**
 * Embedding provider seam for semantic (vector) retrieval.
 *
 * No provider is wired yet — `getEmbeddingProvider()` returns null, so Ask AI
 * retrieval stays keyword-only (Postgres FTS) and nothing calls out to an
 * embedding API. To turn on semantic search later:
 *
 *   1. Pick a provider and implement it below (Voyage and OpenAI sketches are
 *      in the comments), returning it from getEmbeddingProvider() when its API
 *      key env var is set.
 *   2. Set EMBEDDING_DIMENSIONS to that provider's output size and run
 *      scripts/pgvector-setup.sql against Neon with the SAME dimension.
 *   3. Backfill existing rows: `npx tsx scripts/backfill-embeddings.ts`.
 *
 * The pgvector column lives ONLY on Neon (added by the SQL script, read/written
 * via raw SQL) — deliberately kept out of the Drizzle schema so the PGlite test
 * harness, which can't load the vector extension, keeps working.
 */

/** Must match the `vector(N)` dimension in scripts/pgvector-setup.sql. */
export const EMBEDDING_DIMENSIONS = 1024;

export interface EmbeddingProvider {
  /** Stable id, handy for logging / cache keys. */
  readonly id: string;
  /** Output vector length; must equal the pgvector column dimension. */
  readonly dimensions: number;
  /** Embed one or more texts, preserving input order. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * The configured provider, or null when semantic search isn't set up. Returning
 * null keeps retrieval on the keyword path with zero external calls.
 *
 * Voyage voyage-3.5 (Anthropic's recommended partner) outputs 1024 dims, which
 * matches EMBEDDING_DIMENSIONS and the vector(1024) column in
 * scripts/pgvector-setup.sql. To use OpenAI instead (text-embedding-3-small,
 * 1536 dims) implement openAiProvider below and change EMBEDDING_DIMENSIONS and
 * the SQL column to 1536.
 */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  const key = process.env.VOYAGE_API_KEY;
  if (key) return voyageProvider(key);
  return null;
}

/**
 * Voyage AI embeddings (https://docs.voyageai.com). Batched POST to /v1/embeddings;
 * responses may arrive out of order, so we re-sort by each item's `index`.
 */
function voyageProvider(apiKey: string): EmbeddingProvider {
  const MODEL = "voyage-3.5";
  return {
    id: MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      const res = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, input: texts }),
      });
      if (!res.ok) {
        throw new Error(
          `Voyage embeddings failed (${res.status}): ${await res.text()}`,
        );
      }
      const json = (await res.json()) as {
        data: { index: number; embedding: number[] }[];
      };
      return json.data
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    },
  };
}

/**
 * Format a vector as a pgvector text literal: `[0.1,0.2,...]`. Cast the bound
 * value to `::vector` in SQL. Kept pure and exported so it can be unit-tested
 * without a database.
 */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
