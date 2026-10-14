import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { integrations, type Integration } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/server/secret-box";

/**
 * Integrations: external data sources the TEAM chat can use (never anonymous
 * visitors). Two kinds:
 * - postgres: a read-only connection string; the chat gets a `query_<name>`
 *   tool we execute ourselves in a READ ONLY transaction with a timeout.
 * - mcp: a remote MCP server attached through the Claude API's MCP connector,
 *   limited to an allowlist of tools.
 * Credentials are encrypted at rest and never leave the server except to the
 * system they belong to.
 */

export type IntegrationKind = Integration["kind"];

export type IntegrationRow = Omit<Integration, "secretEnc"> & {
  /** last few characters of the credential, for recognition only */
  secretHint: string;
};

/** Decrypted, ready to hand to the chat runtime. */
export type ChatIntegration = {
  id: string;
  name: string;
  kind: IntegrationKind;
  description: string;
  url: string | null;
  secret: string;
  allowedTools: string[];
};

const NAME_RE = /^[a-z][a-z0-9_]{1,39}$/;

export function normalizeIntegrationName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseToolList(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[\s,]+/);
  return [...new Set(parts.map((t) => t.trim()).filter(Boolean))];
}

function validate(opts: {
  name: string;
  kind: IntegrationKind;
  url?: string | null;
  secret?: string;
}) {
  if (!NAME_RE.test(opts.name)) {
    throw new Error(
      "Name must start with a letter and use only lowercase letters, numbers and underscores (2–40 chars)",
    );
  }
  if (opts.secret !== undefined) {
    const secret = opts.secret.trim();
    if (secret === "") {
      throw new Error(
        opts.kind === "postgres"
          ? "Connection string is required"
          : "Authorization token is required",
      );
    }
    if (opts.kind === "postgres" && !/^postgres(ql)?:\/\//.test(secret)) {
      throw new Error("Connection string must start with postgres:// or postgresql://");
    }
  }
  if (opts.kind === "mcp") {
    let url: URL;
    try {
      url = new URL(opts.url ?? "");
    } catch {
      throw new Error("MCP server URL is required");
    }
    if (url.protocol !== "https:") {
      throw new Error("MCP server URL must use https://");
    }
  }
}

function hint(secret: string): string {
  // for a connection string show the host, never the password
  try {
    const u = new URL(secret);
    if (u.protocol.startsWith("postgres")) {
      return `${u.username || "?"}@${u.hostname}${u.pathname}`;
    }
  } catch {
    // not a URL — fall through to a tail hint
  }
  return secret.length > 8 ? `…${secret.slice(-4)}` : "••••";
}

function toRow(i: Integration): IntegrationRow {
  const { secretEnc, ...rest } = i;
  let secretHint = "••••";
  try {
    secretHint = hint(decryptSecret(secretEnc));
  } catch {
    secretHint = "unreadable — re-enter the credential";
  }
  return { ...rest, secretHint };
}

export async function createIntegration(
  db: Db,
  opts: {
    name: string;
    kind: IntegrationKind;
    description: string;
    secret: string;
    url?: string | null;
    allowedTools?: string[];
    userId: string;
  },
): Promise<string> {
  const name = normalizeIntegrationName(opts.name);
  validate({ ...opts, name });
  const existing = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(eq(integrations.name, name));
  if (existing.length > 0) {
    throw new Error(`An integration named “${name}” already exists`);
  }
  const [row] = await db
    .insert(integrations)
    .values({
      name,
      kind: opts.kind,
      description: opts.description.trim(),
      url: opts.kind === "mcp" ? opts.url!.trim() : null,
      secretEnc: encryptSecret(opts.secret.trim()),
      allowedTools: opts.kind === "mcp" ? parseToolList(opts.allowedTools ?? []) : [],
      createdBy: opts.userId,
    })
    .returning({ id: integrations.id });
  return row.id;
}

export async function updateIntegration(
  db: Db,
  id: string,
  patch: {
    description?: string;
    allowedTools?: string[];
    url?: string;
    /** omitted or blank → keep the stored credential */
    secret?: string;
    enabled?: boolean;
  },
): Promise<void> {
  const [current] = await db
    .select()
    .from(integrations)
    .where(eq(integrations.id, id));
  if (!current) throw new Error("Integration not found");
  const secret = patch.secret?.trim() ? patch.secret.trim() : undefined;
  const url = patch.url !== undefined ? patch.url.trim() : current.url;
  validate({ name: current.name, kind: current.kind, url, secret });
  await db
    .update(integrations)
    .set({
      ...(patch.description !== undefined
        ? { description: patch.description.trim() }
        : {}),
      ...(patch.allowedTools !== undefined && current.kind === "mcp"
        ? { allowedTools: parseToolList(patch.allowedTools) }
        : {}),
      ...(current.kind === "mcp" ? { url } : {}),
      ...(secret ? { secretEnc: encryptSecret(secret) } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(integrations.id, id));
}

export async function deleteIntegration(db: Db, id: string): Promise<void> {
  await db.delete(integrations).where(eq(integrations.id, id));
}

export async function listIntegrations(db: Db): Promise<IntegrationRow[]> {
  const rows = await db
    .select()
    .from(integrations)
    .orderBy(asc(integrations.name));
  return rows.map(toRow);
}

/** The decrypted credential + config for one integration (admin test). */
export async function getChatIntegration(
  db: Db,
  id: string,
): Promise<ChatIntegration | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(eq(integrations.id, id));
  return row ? toChat(row) : null;
}

function toChat(row: Integration): ChatIntegration {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    url: row.url,
    secret: decryptSecret(row.secretEnc),
    allowedTools: row.allowedTools,
  };
}

/**
 * Enabled integrations for a team chat. A row whose credential can't be
 * decrypted (e.g. the secret was rotated) is skipped, not fatal.
 */
export async function loadChatIntegrations(db: Db): Promise<ChatIntegration[]> {
  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.enabled, true))
    .orderBy(asc(integrations.name));
  const out: ChatIntegration[] = [];
  for (const row of rows) {
    try {
      out.push(toChat(row));
    } catch (err) {
      console.error(`Integration ${row.name}: credential unreadable`, err);
    }
  }
  return out;
}

export async function markIntegrationsUsed(
  db: Db,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(integrations)
    .set({ lastUsedAt: sql`now()` })
    .where(inArray(integrations.id, ids));
}
