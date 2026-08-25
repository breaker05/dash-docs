import { beforeEach, afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { pageRevisions, pages, redirects } from "@/db/schema";
import { runImport } from "./import-legacy";
import { findRedirect } from "./pages/tree";
import { searchPages } from "./search";

const LEGACY_DIR = "/Users/keenan/code/dash/dash-docs";

let db: Db;
let close: () => Promise<void>;
let publicDir: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "import-public-"));
});

afterEach(async () => {
  await close();
  fs.rmSync(publicDir, { recursive: true, force: true });
});

describe("runImport (against the real legacy repo)", () => {
  it("imports, publishes, redirects, rewrites links, copies statics — idempotently", async () => {
    await runImport(db, { legacyDir: LEGACY_DIR, publicDir });

    const all = await db.select().from(pages);
    expect(all).toHaveLength(3);
    expect(all.every((p) => p.publishedContentMd !== null)).toBe(true);

    const [home] = await db.select().from(pages).where(eq(pages.isHome, true));
    expect(home.slug).toBe("overview");
    // frontmatter stripped
    expect(home.publishedContentMd).not.toContain("layout: default");
    // links rewritten
    expect(home.publishedContentMd).toContain("(/lead-submission-api)");
    expect(home.publishedContentMd).not.toContain("LEAD_SUBMISSION_API.md");

    // legacy URLs resolve (case-insensitive + .html handled by findRedirect)
    for (const legacy of [
      "LEAD_SUBMISSION_API",
      "customer_import_api.html",
      "API_DOCUMENTATION",
    ]) {
      const hit = await findRedirect(db, legacy);
      expect(hit, legacy).toBeTruthy();
    }

    // content is searchable
    const hits = await searchPages(db, {
      query: "lead submit",
      includeInternal: false,
    });
    expect(hits.length).toBeGreaterThan(0);

    // statics copied
    expect(fs.existsSync(path.join(publicDir, "security-overview.html"))).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(publicDir, "dash-customer-import.postman_collection.json"),
      ),
    ).toBe(true);

    // idempotent: run again → still 3 pages, one import revision added each
    await runImport(db, { legacyDir: LEGACY_DIR, publicDir });
    expect(await db.select().from(pages)).toHaveLength(3);
    const revs = await db.select().from(pageRevisions);
    expect(revs.filter((r) => r.kind === "import")).toHaveLength(6);
    expect(await db.select().from(redirects)).toHaveLength(4);
  });
});
