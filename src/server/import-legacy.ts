import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { pages, redirects, users } from "@/db/schema";
import { insertRevision } from "@/server/pages/revisions";
import { markdownToPlainText } from "@/lib/markdoc/plain-text";

const LINK_REWRITES: Array<[RegExp, string]> = [
  [/\(\.\/API_DOCUMENTATION\.md(#[^)]*)?\)/g, "(/$1)"],
  [/\(\.\/LEAD_SUBMISSION_API\.md(#[^)]*)?\)/g, "(/lead-submission-api$1)"],
  [/\(\.\/CUSTOMER_IMPORT_API\.md(#[^)]*)?\)/g, "(/customer-import-api$1)"],
  [
    /\(\.\/dash-customer-import\.postman_collection\.json\)/g,
    "(/dash-customer-import.postman_collection.json)",
  ],
];

const IMPORTS: Array<{
  file: string;
  slug: string;
  title: string;
  isHome: boolean;
}> = [
  {
    file: "index.md",
    slug: "overview",
    title: "Dash Marketing API Documentation",
    isHome: true,
  },
  {
    file: "LEAD_SUBMISSION_API.md",
    slug: "lead-submission-api",
    title: "Lead Submission API",
    isHome: false,
  },
  {
    file: "CUSTOMER_IMPORT_API.md",
    slug: "customer-import-api",
    title: "Customer Import API",
    isHome: false,
  },
];

// old GitHub Pages URLs (matched lowercased, .html-stripped) → new slug
const REDIRECTS: Array<[string, string]> = [
  ["index", "overview"],
  ["api_documentation", "overview"],
  ["lead_submission_api", "lead-submission-api"],
  ["customer_import_api", "customer-import-api"],
];

const STATIC_FILES = [
  "security-overview.html",
  "dash-customer-import.postman_collection.json",
];

export function prepareMarkdown(raw: string): string {
  let md = raw.replace(/^---\n[\s\S]*?\n---\n/, ""); // strip Jekyll frontmatter
  for (const [pattern, replacement] of LINK_REWRITES) {
    md = md.replace(pattern, replacement);
  }
  return md;
}

async function getImportUser(db: Db): Promise<string> {
  const email = "import@dashmarketing.io";
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));
  if (existing) return existing.id;
  const [admin] = await db.select().from(users).where(eq(users.role, "admin"));
  if (admin) return admin.id;
  const [created] = await db
    .insert(users)
    .values({ email, name: "Legacy import", role: "editor" })
    .returning();
  return created.id;
}

/**
 * Idempotent import of the legacy Jekyll docs repo: pages are upserted by
 * slug and published (revision kind `import`); old URLs get redirect rows;
 * standalone legacy files are copied into public/.
 */
export async function runImport(
  db: Db,
  opts: { legacyDir: string; publicDir: string; log?: (msg: string) => void },
): Promise<void> {
  const log = opts.log ?? (() => {});
  const userId = await getImportUser(db);

  let position = 0;
  for (const item of IMPORTS) {
    const raw = fs.readFileSync(path.join(opts.legacyDir, item.file), "utf8");
    const contentMd = prepareMarkdown(raw);
    const plain = markdownToPlainText(contentMd);

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(pages)
        .where(eq(pages.slug, item.slug));

      let pageId: string;
      if (existing) {
        pageId = existing.id;
        await tx
          .update(pages)
          .set({ title: item.title, contentMd, updatedBy: userId })
          .where(eq(pages.id, pageId));
        log(`updated  ${item.slug}`);
      } else {
        const [created] = await tx
          .insert(pages)
          .values({
            slug: item.slug,
            path: item.slug,
            title: item.title,
            contentMd,
            isHome: item.isHome,
            position,
            updatedBy: userId,
          })
          .returning();
        pageId = created.id;
        log(`created  ${item.slug}`);
      }

      const revision = await insertRevision(tx, {
        pageId,
        title: item.title,
        contentMd,
        kind: "import",
        userId,
      });
      await tx
        .update(pages)
        .set({
          publishedTitle: item.title,
          publishedContentMd: contentMd,
          publishedPlain: plain,
          publishedRevisionId: revision.id,
          publishedAt: new Date(),
          publishedBy: userId,
        })
        .where(eq(pages.id, pageId));
    });
    position++;
  }

  for (const [fromPath, slug] of REDIRECTS) {
    const [target] = await db.select().from(pages).where(eq(pages.slug, slug));
    if (!target) continue;
    await db
      .insert(redirects)
      .values({ fromPath, toPageId: target.id })
      .onConflictDoUpdate({
        target: redirects.fromPath,
        set: { toPageId: target.id },
      });
  }
  log(`redirects ensured (${REDIRECTS.length})`);

  for (const file of STATIC_FILES) {
    const src = path.join(opts.legacyDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(opts.publicDir, file));
      log(`copied   public/${file}`);
    }
  }
}
