import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { editPresence, pages, users } from "@/db/schema";
import { createPage, updateDraft, DRAFT_CONFLICT } from "./pages/tree";
import { activeEditors, heartbeat } from "./presence";
import { eq, sql } from "drizzle-orm";

let db: Db;
let close: () => Promise<void>;
let alice: string;
let bob: string;
let pageId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  const rows = await db
    .insert(users)
    .values([
      { email: "alice@dashmarketing.io", name: "Alice" },
      { email: "bob@dashmarketing.io", name: "Bob" },
    ])
    .returning();
  alice = rows[0].id;
  bob = rows[1].id;
  pageId = (
    await createPage(db, { title: "Doc", parentId: null, userId: alice })
  ).id;
});

afterEach(async () => {
  await close();
});

describe("edit presence", () => {
  it("reports other active editors, not yourself or stale ones", async () => {
    await heartbeat(db, { pageId, userId: alice, userName: "Alice" });
    await heartbeat(db, { pageId, userId: bob, userName: "Bob" });

    const seenByAlice = await activeEditors(db, {
      pageId,
      excludeUserId: alice,
    });
    expect(seenByAlice).toEqual([{ userId: bob, userName: "Bob" }]);

    // stale presence disappears
    const future = new Date(Date.now() + 120_000);
    expect(
      await activeEditors(db, { pageId, excludeUserId: alice, now: future }),
    ).toEqual([]);

    // heartbeat upserts rather than duplicating
    await heartbeat(db, { pageId, userId: bob, userName: "Bob" });
    const rows = await db
      .select()
      .from(editPresence)
      .where(eq(editPresence.pageId, pageId));
    expect(rows).toHaveLength(2);
  });
});

describe("draft conflict detection", () => {
  it("rejects a save based on an older draft state", async () => {
    const first = await updateDraft(db, {
      id: pageId,
      contentMd: "alice v1",
      userId: alice,
    });

    // bob saves on top of alice's state — fine
    const second = await updateDraft(db, {
      id: pageId,
      contentMd: "bob v2",
      userId: bob,
      baseDraftUpdatedAt: first.draftUpdatedAt,
    });

    // alice saves again still based on her original state — conflict
    await expect(
      updateDraft(db, {
        id: pageId,
        contentMd: "alice overwrites",
        userId: alice,
        baseDraftUpdatedAt: first.draftUpdatedAt,
      }),
    ).rejects.toThrow(DRAFT_CONFLICT);

    // carrying the fresh timestamp forward works
    const third = await updateDraft(db, {
      id: pageId,
      contentMd: "alice v3",
      userId: alice,
      baseDraftUpdatedAt: second.draftUpdatedAt,
    });
    expect(third.draftUpdatedAt.getTime()).toBeGreaterThanOrEqual(
      second.draftUpdatedAt.getTime(),
    );
  });

  it("tolerates microsecond-precision stored timestamps (existing rows)", async () => {
    // rows written by defaultNow()/restore carry microseconds; the client's
    // base timestamp round-trips through a JS Date at millisecond precision
    await db
      .update(pages)
      .set({
        draftUpdatedAt: sql`date_trunc('milliseconds', now()) + interval '0.000528 seconds'`,
      })
      .where(eq(pages.id, pageId));
    const [row] = await db
      .select({ draftUpdatedAt: pages.draftUpdatedAt })
      .from(pages)
      .where(eq(pages.id, pageId));

    // first save after loading such a page must NOT conflict
    const saved = await updateDraft(db, {
      id: pageId,
      contentMd: "edit on legacy row",
      userId: alice,
      baseDraftUpdatedAt: row.draftUpdatedAt,
    });
    expect(saved.draftUpdatedAt).toBeInstanceOf(Date);
  });

  it("saves without a precondition still work (legacy callers)", async () => {
    const r = await updateDraft(db, {
      id: pageId,
      contentMd: "no precondition",
      userId: alice,
    });
    expect(r.draftUpdatedAt).toBeInstanceOf(Date);
  });
});
