import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
} from "./api-keys";

let db: Db;
let close: () => Promise<void>;
let userId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const [u] = await db
    .insert(users)
    .values({ email: "t@dashmarketing.io", role: "admin" })
    .returning();
  userId = u.id;
});

afterEach(async () => {
  await close();
});

describe("api keys", () => {
  it("creates, verifies, and tracks usage", async () => {
    const { id, token } = await createApiKey(db, { name: "Mapping bot", userId });
    expect(token).toMatch(/^dashdocs_[0-9a-f]{48}$/);

    const verified = await verifyApiKey(db, token);
    expect(verified).toEqual({ id, name: "Mapping bot" });

    const [listed] = await listApiKeys(db);
    expect(listed.keyPrefix).toBe(token.slice(0, 15));
    expect(listed.lastUsedAt).not.toBeNull();
    // the raw token is never stored
    expect(JSON.stringify(listed)).not.toContain(token);
  });

  it("rejects unknown and revoked keys", async () => {
    expect(await verifyApiKey(db, "dashdocs_" + "0".repeat(48))).toBeNull();
    expect(await verifyApiKey(db, "not-even-prefixed")).toBeNull();

    const { id, token } = await createApiKey(db, { name: "Old bot", userId });
    await revokeApiKey(db, id);
    expect(await verifyApiKey(db, token)).toBeNull();
  });

  it("requires a name", async () => {
    await expect(createApiKey(db, { name: "  ", userId })).rejects.toThrow(
      "name",
    );
  });
});
