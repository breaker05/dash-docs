-- Semantic-search setup for Ask AI — run ONCE against Neon (prod).
--
-- This is deliberately NOT a Drizzle migration. The app's test suite applies
-- the drizzle/ migrations to an in-memory PGlite database, and that PGlite
-- build cannot load the `vector` extension — so putting pgvector in a Drizzle
-- migration would break every test. Instead, pgvector lives only on Neon and
-- the app reads/writes the `embedding` column via raw SQL.
--
-- Run it with the UNPOOLED connection (DDL + extension creation):
--   psql "$DATABASE_URL_UNPOOLED" -f scripts/pgvector-setup.sql
-- (or paste it into the Neon SQL editor).
--
-- IMPORTANT: the vector dimension below (1024) must match
-- EMBEDDING_DIMENSIONS in src/server/embeddings.ts and your chosen provider:
--   Voyage voyage-3.5 → 1024   |   OpenAI text-embedding-3-small → 1536
-- If you pick a 1536-dim model, change BOTH the 1024 here and the constant.

CREATE EXTENSION IF NOT EXISTS vector;

-- Uploaded reference-file chunks.
ALTER TABLE context_chunk
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- Published-page chunks (the docs themselves — the source of truth).
ALTER TABLE page_chunk
  ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- HNSW indexes for fast approximate nearest-neighbour cosine search. Cosine
-- (`vector_cosine_ops` / the `<=>` operator) matches how the app queries.
-- HNSW builds incrementally, so it's safe to create before backfilling.
CREATE INDEX IF NOT EXISTS context_chunk_embedding_idx
  ON context_chunk
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS page_chunk_embedding_idx
  ON page_chunk
  USING hnsw (embedding vector_cosine_ops);

-- After this runs:
--   1. Populate + embed page chunks:  npx tsx scripts/reindex-pages.ts
--   2. Embed any remaining chunks:    npx tsx scripts/backfill-embeddings.ts
