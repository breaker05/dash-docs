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
 *   3. Backfill existing rows: `node scripts/backfill-embeddings.mjs`.
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
 */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  // --- Not configured yet. Implement one of the below and return it. ---
  //
  // Voyage (Anthropic's recommended partner, 1024 dims for voyage-3.5):
  //   const key = process.env.VOYAGE_API_KEY;
  //   if (key) return voyageProvider(key);
  //
  // OpenAI (text-embedding-3-small, 1536 dims — set EMBEDDING_DIMENSIONS=1536):
  //   const key = process.env.OPENAI_API_KEY;
  //   if (key) return openAiProvider(key);
  return null;
}

/**
 * Format a vector as a pgvector text literal: `[0.1,0.2,...]`. Cast the bound
 * value to `::vector` in SQL. Kept pure and exported so it can be unit-tested
 * without a database.
 */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
