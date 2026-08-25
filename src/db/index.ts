import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

// The websocket Pool driver (not neon-http) because tree moves and publishing
// rely on interactive transactions.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });

// Common interface satisfied by both the Neon driver (prod) and the PGlite
// driver (tests), so server logic can be exercised against an in-memory
// Postgres. PgTransaction also satisfies it, so functions taking a `Db` can
// be called inside transactions.
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export { schema };
