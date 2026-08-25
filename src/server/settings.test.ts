import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import { getSettings, setSetting, PDF_FOOTER_KEY, PDF_HEADER_KEY } from "./settings";

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

describe("settings", () => {
  it("upserts, reads, and deletes-on-empty", async () => {
    await setSetting(db, { key: PDF_HEADER_KEY, value: "Confidential | {date}", userId });
    await setSetting(db, { key: PDF_FOOTER_KEY, value: "{title} | {page}/{pages}", userId });
    expect(await getSettings(db, [PDF_HEADER_KEY, PDF_FOOTER_KEY])).toEqual({
      [PDF_HEADER_KEY]: "Confidential | {date}",
      [PDF_FOOTER_KEY]: "{title} | {page}/{pages}",
    });

    await setSetting(db, { key: PDF_HEADER_KEY, value: "Updated", userId });
    expect((await getSettings(db, [PDF_HEADER_KEY]))[PDF_HEADER_KEY]).toBe("Updated");

    // empty value clears the setting
    await setSetting(db, { key: PDF_HEADER_KEY, value: "  ", userId });
    expect(await getSettings(db, [PDF_HEADER_KEY])).toEqual({});
  });
});
