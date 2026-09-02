/**
 * Backfill embeddings for chunks that don't have one yet — both uploaded
 * reference files (context_chunk) and published-page content (page_chunk).
 *
 * Prereqs: scripts/pgvector-setup.sql has been run against Neon, AND an
 * embedding provider is implemented + keyed in src/server/embeddings.ts.
 * (For pages, run scripts/reindex-pages.ts first so the chunks exist.)
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

async function backfillTable(
  table: "context_chunk" | "page_chunk",
  embedder: NonNullable<ReturnType<typeof getEmbeddingProvider>>,
): Promise<number> {
  const BATCH = 128;
  let total = 0;
  for (;;) {
    const res = (await db.execute(sql`
      select id, content from ${sql.raw(table)}
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
          update ${sql.raw(table)}
          set embedding = ${toVectorLiteral(vectors[i])}::vector
          where id = ${r.id}
        `),
      ),
    );
    total += rows.length;
    console.log(`  ${table}: embedded ${total}…`);
  }
  return total;
}

async function main() {
  const embedder = getEmbeddingProvider();
  if (!embedder) {
    console.error(
      "No embedding provider configured. Implement one in " +
        "src/server/embeddings.ts and set its API key, then re-run.",
    );
    process.exit(1);
  }

  const files = await backfillTable("context_chunk", embedder);
  const pages = await backfillTable("page_chunk", embedder);

  console.log(`Done. Embedded ${files} file chunk(s), ${pages} page chunk(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
