import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { apiKeys } from "@/db/schema";

const KEY_PREFIX = "dashdocs_";

function hashKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mint a new API key. The raw token is returned exactly once — only its
 * SHA-256 hash is stored.
 */
export async function createApiKey(
  db: Db,
  opts: { name: string; userId: string },
): Promise<{ id: string; token: string }> {
  const name = opts.name.trim();
  if (name === "") throw new Error("Key name is required");
  const token = KEY_PREFIX + randomBytes(24).toString("hex");
  const [row] = await db
    .insert(apiKeys)
    .values({
      name,
      keyHash: hashKey(token),
      keyPrefix: token.slice(0, KEY_PREFIX.length + 6),
      createdBy: opts.userId,
    })
    .returning({ id: apiKeys.id });
  return { id: row.id, token };
}

/**
 * Resolve a bearer token to an active key, bumping last_used_at.
 * Returns null for unknown or revoked keys.
 */
export async function verifyApiKey(
  db: Db,
  token: string,
): Promise<{ id: string; name: string } | null> {
  if (!token.startsWith(KEY_PREFIX)) return null;
  const [row] = await db
    .update(apiKeys)
    .set({ lastUsedAt: sql`now()` })
    .where(and(eq(apiKeys.keyHash, hashKey(token)), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id, name: apiKeys.name });
  return row ?? null;
}

export async function listApiKeys(db: Db) {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(db: Db, id: string): Promise<void> {
  await db
    .update(apiKeys)
    .set({ revokedAt: sql`now()` })
    .where(eq(apiKeys.id, id));
}

/** Permanently remove a key. Only revoked keys can be deleted. */
export async function deleteApiKey(db: Db, id: string): Promise<void> {
  const deleted = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), isNotNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  if (deleted.length === 0) {
    throw new Error("Only revoked keys can be deleted");
  }
}
