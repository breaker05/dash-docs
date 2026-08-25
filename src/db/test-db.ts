import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import type { Db } from "./index";
import * as schema from "./schema";

/**
 * In-memory Postgres for tests, with the real migrations from ./drizzle
 * applied. Structurally identical to production Neon.
 */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
  return { db: db as unknown as Db, close: () => client.close() };
}
