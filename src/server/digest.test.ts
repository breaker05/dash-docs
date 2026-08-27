import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { users } from "@/db/schema";
import { createPage, updateDraft, setVisibility } from "./pages/tree";
import { publishPage } from "./pages/publish";
import { formatDigest, recentPublishes } from "./digest";

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

describe("recentPublishes", () => {
  it("labels first publishes vs updates, dedupes, filters visibility", async () => {
    const a = await createPage(db, { title: "Public A", parentId: null, userId });
    const b = await createPage(db, { title: "Secret B", parentId: null, userId });
    await setVisibility(db, { id: b.id, visibility: "internal", userId });

    await publishPage(db, { id: a.id, userId });
    await publishPage(db, { id: b.id, userId });
    // a gets updated and re-published — should appear once, as an update
    await updateDraft(db, { id: a.id, contentMd: "v2", userId });
    await publishPage(db, { id: a.id, userId });

    const publicView = await recentPublishes(db, { includeInternal: false });
    expect(publicView.map((e) => [e.title, e.isUpdate, e.internal])).toEqual([
      ["Public A", true, false],
    ]);

    const teamView = await recentPublishes(db, { includeInternal: true });
    expect(teamView.map((e) => e.title).sort()).toEqual([
      "Public A",
      "Secret B",
    ]);
    const secret = teamView.find((e) => e.title === "Secret B")!;
    expect(secret.isUpdate).toBe(false);
    expect(secret.internal).toBe(true);
  });

  it("respects the since cutoff", async () => {
    const a = await createPage(db, { title: "Old", parentId: null, userId });
    await publishPage(db, { id: a.id, userId });
    const future = new Date(Date.now() + 60_000);
    expect(
      await recentPublishes(db, { includeInternal: true, since: future }),
    ).toEqual([]);
  });
});

describe("formatDigest", () => {
  it("formats slack mrkdwn with links and lock markers", () => {
    const text = formatDigest(
      [
        {
          pageId: "1",
          title: "Lead API",
          path: "api/lead",
          isHome: false,
          internal: false,
          publishedAt: new Date(),
          isUpdate: true,
        },
        {
          pageId: "2",
          title: "PTO Policy",
          path: "hr/pto",
          isHome: false,
          internal: true,
          publishedAt: new Date(),
          isUpdate: false,
        },
      ],
      "https://docs.example.com",
    );
    expect(text).toContain("<https://docs.example.com/api/lead|Lead API> — updated");
    expect(text).toContain("<https://docs.example.com/hr/pto|PTO Policy> 🔒 — new");
    expect(text).toContain("2 pages");
  });

  it("handles an empty week", () => {
    expect(formatDigest([], "https://x")).toContain("No pages were published");
  });
});
