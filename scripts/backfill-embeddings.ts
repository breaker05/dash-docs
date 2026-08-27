/**
 * Backfill embeddings for context-file chunks that don't have one yet.
 *
 * Prereqs: scripts/pgvector-setup.sql has been run against Neon, AND an
 * embedding provider is implemented + keyed in src/server/embeddings.ts.
 *
 * Run:  npx tsx scripts/backfill-embeddings.ts
 * (Add tsx if needed:  npm i -D tsx)
 *
 * Idempotent — only touches rows where embedding IS NULL, so it's safe to
 * re-run after a partial failure or after uploading more files.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getEmbeddingProvider, toVectorLiteral } from "@/server/embeddings";

type Row = { id: string; content: string };

async function main() {
  const embedder = getEmbeddingProvider();
  if (!embedder) {
    console.error(
      "No embedding provider configured. Implement one in " +
        "src/server/embeddings.ts and set its API key, then re-run.",
    );
    process.exit(1);
  }

  const BATCH = 128;
  let total = 0;
  for (;;) {
    const res = (await db.execute(sql`
      select id, content from context_chunk
      where embedding is null
      order by id
      limit ${BATCH}
    `)) as unknown as Row[] | { rows: Row[] };
    const rows = Array.isArray(res) ? res : res.rows;
    if (rows.length === 0) break;

    const vectors = await embedder.embed(rows.map((r) => r.content));
    await Promise.all(
      rows.map((r, i) =>
        db.execute(sql`
          update context_chunk
          set embedding = ${toVectorLiteral(vectors[i])}::vector
          where id = ${r.id}
        `),
      ),
    );
    total += rows.length;
    console.log(`embedded ${total} chunks…`);
  }

  console.log(`Done. Embedded ${total} chunk(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
