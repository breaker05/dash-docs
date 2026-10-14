import { Client } from "pg";

/**
 * Read-only SQL against an external Postgres (a "postgres" integration).
 *
 * The real safety boundary is the database role: connect as a role that only
 * has SELECT on the tables the team chat should see. On top of that, every
 * query here runs inside a READ ONLY transaction that is always rolled back,
 * with a statement timeout, one statement per call, and a row/size cap on
 * what goes back to the model.
 */

export const MAX_ROWS = 200;
const MAX_RESULT_CHARS = 40_000;
const STATEMENT_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 8_000;

const READ_KEYWORDS = new Set(["select", "with", "explain", "show", "table", "values"]);

/** SQL with comments and quoted strings/identifiers blanked out. */
function stripLiterals(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "''")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

/**
 * Rejects anything but a single read statement. Not the security boundary
 * (the READ ONLY transaction and the role are) — it gives the model a clear
 * error instead of a confusing Postgres one, and blocks statement stacking.
 */
export function checkReadOnlySql(sql: string): string {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (trimmed === "") throw new Error("Query is empty");
  const bare = stripLiterals(trimmed);
  if (bare.includes(";")) {
    throw new Error("Send one statement per call (no `;`-separated statements)");
  }
  const first =
    bare.trim().replace(/^\(+\s*/, "").split(/[\s(]+/)[0]?.toLowerCase() ?? "";
  if (!READ_KEYWORDS.has(first)) {
    throw new Error(
      `Only read queries are allowed (SELECT/WITH/EXPLAIN/SHOW); got “${first.toUpperCase()}”`,
    );
  }
  if (first === "with" && /\b(insert|update|delete|merge)\b/i.test(bare)) {
    // data-modifying CTE; READ ONLY would reject it anyway, this explains why
    throw new Error("Data-modifying statements are not allowed");
  }
  return trimmed;
}

export type QueryResult = {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  ms: number;
};

async function withReadOnly<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: STATEMENT_TIMEOUT_MS + 2_000,
    application_name: "dash-docs-ask",
  });
  await client.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    try {
      return await fn(client);
    } finally {
      await client.query("ROLLBACK").catch(() => {});
    }
  } finally {
    await client.end().catch(() => {});
  }
}

export async function runReadOnlyQuery(
  connectionString: string,
  sql: string,
): Promise<QueryResult> {
  const statement = checkReadOnlySql(sql);
  const started = Date.now();
  return withReadOnly(connectionString, async (client) => {
    const res = await client.query(statement);
    const rows = (res.rows ?? []) as Record<string, unknown>[];
    return {
      columns: (res.fields ?? []).map((f) => f.name),
      rows: rows.slice(0, MAX_ROWS),
      rowCount: res.rowCount ?? rows.length,
      truncated: rows.length > MAX_ROWS,
      ms: Date.now() - started,
    };
  });
}

/** Compact, size-capped text rendering of a result for the model. */
export function formatQueryResult(result: QueryResult): string {
  const header = `${result.rowCount} row${result.rowCount === 1 ? "" : "s"}${
    result.truncated ? ` (showing the first ${result.rows.length} — add a LIMIT or narrow the WHERE)` : ""
  }`;
  if (result.rows.length === 0) return header;
  const body = JSON.stringify(
    result.rows,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  );
  if (body.length <= MAX_RESULT_CHARS) return `${header}\n${body}`;
  return `${header}\n${body.slice(0, MAX_RESULT_CHARS)}\n…(output cut at ${MAX_RESULT_CHARS} characters — select fewer columns or rows)`;
}

export type ConnectionCheck = {
  currentUser: string;
  database: string;
  superuser: boolean;
  /** tables this role can INSERT/UPDATE/DELETE/TRUNCATE — should be 0 */
  writableTables: number;
  readableTables: number;
};

/**
 * Connects and reports what the role can do, so an admin can confirm the
 * credential is genuinely read-only before the chat uses it.
 */
export async function checkConnection(
  connectionString: string,
): Promise<ConnectionCheck> {
  return withReadOnly(connectionString, async (client) => {
    const { rows } = await client.query<{
      current_user: string;
      database: string;
      superuser: boolean;
      writable: string;
      readable: string;
    }>(`
      select
        current_user,
        current_database() as database,
        coalesce((select rolsuper from pg_roles where rolname = current_user), false) as superuser,
        (select count(*) from information_schema.tables
          where table_schema not in ('pg_catalog', 'information_schema')
            and (has_table_privilege(quote_ident(table_schema) || '.' || quote_ident(table_name), 'INSERT')
              or has_table_privilege(quote_ident(table_schema) || '.' || quote_ident(table_name), 'UPDATE')
              or has_table_privilege(quote_ident(table_schema) || '.' || quote_ident(table_name), 'DELETE')
              or has_table_privilege(quote_ident(table_schema) || '.' || quote_ident(table_name), 'TRUNCATE'))) as writable,
        (select count(*) from information_schema.tables
          where table_schema not in ('pg_catalog', 'information_schema')
            and has_table_privilege(quote_ident(table_schema) || '.' || quote_ident(table_name), 'SELECT')) as readable
    `);
    const r = rows[0];
    return {
      currentUser: r.current_user,
      database: r.database,
      superuser: r.superuser,
      writableTables: Number(r.writable),
      readableTables: Number(r.readable),
    };
  });
}
