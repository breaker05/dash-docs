import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./test-db";
import { pages, users } from "./schema";

describe("schema migrations", () => {
  it("applies migrations and enforces core constraints", async () => {
    const { db, close } = await createTestDb();
    try {
      const [user] = await db
        .insert(users)
        .values({ email: "test@dashmarketing.io", name: "Test" })
        .returning();
      expect(user.role).toBe("editor");

      const [page] = await db
        .insert(pages)
        .values({ slug: "guide", path: "guide", title: "Guide" })
        .returning();
      expect(page.effectiveVisibility).toBe("public");

      // sibling slug uniqueness applies at the root level too (NULLS NOT DISTINCT)
      await expect(
        db.insert(pages).values({ slug: "guide", path: "guide-2" }),
      ).rejects.toThrow();

      // only one home page
      await db.insert(pages).values({ slug: "home", path: "home", isHome: true });
      await expect(
        db.insert(pages).values({ slug: "home2", path: "home2", isHome: true }),
      ).rejects.toThrow();

      // generated search vector populates from published content
      await db
        .update(pages)
        .set({ publishedTitle: "Guide", publishedPlain: "lead submission api" })
        .where(sql`${pages.id} = ${page.id}`);
      const hits = await db
        .select({ id: pages.id })
        .from(pages)
        .where(sql`${pages.search} @@ websearch_to_tsquery('english', 'submission')`);
      expect(hits.map((h) => h.id)).toContain(page.id);
    } finally {
      await close();
    }
  });
});
