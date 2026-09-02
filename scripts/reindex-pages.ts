/**
 * Populate Ask AI retrieval chunks for every currently-published page, and
 * embed them if an embedding provider is configured. Pages published from now
 * on are chunked automatically on publish (see src/server/pages/publish.ts);
 * this backfills the ones published before that shipped.
 *
 * Prereqs (for the embedding step): scripts/pgvector-setup.sql has been run on
 * Neon AND VOYAGE_API_KEY is set. Without a provider it still creates the
 * keyword chunks; run backfill-embeddings.ts later to add vectors.
 *
 * Run:  npx tsx scripts/reindex-pages.ts
 * Idempotent — reindexPageChunks replaces a page's chunks each time.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { reindexPageChunks } from "@/server/pages/chunks";

async function main() {
  const published = await db
    .select({ id: pages.id, content: pages.publishedContentMd })
    .from(pages)
    .where(isNotNull(pages.publishedContentMd));

  let total = 0;
  let chunks = 0;
  for (const page of published) {
    const n = await reindexPageChunks(db, {
      pageId: page.id,
      content: page.content ?? "",
    });
    total += 1;
    chunks += n;
    console.log(`reindexed ${page.id} → ${n} chunks`);
  }
  console.log(`Done. Reindexed ${total} page(s), ${chunks} chunk(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
