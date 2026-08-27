import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { launchBrowser } from "@/lib/pdf/browser";
import { renderPdfHtml } from "@/lib/pdf/render-html";
import { buildPdfTemplate, defaultFooterTemplate } from "@/lib/pdf/chrome";
import {
  buildCoverHtml,
  buildTocHtml,
  fetchLogoAsDataUri,
} from "@/lib/pdf/cover";
import { countPages, mergePdfs, stampFooters } from "@/lib/pdf/merge";
import {
  getSettings,
  PDF_FOOTER_KEY,
  PDF_HEADER_KEY,
  PDF_LOGO_KEY,
} from "@/server/settings";
import { siteUrl } from "@/lib/site-url";
import {
  checkRateLimit,
  rateLimitedResponse,
  requestIp,
} from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // PDF rendering launches Chromium — the most expensive endpoint we have,
  // so it gets a tight per-IP limit
  const limit = await checkRateLimit(db, {
    key: `pdf:ip:${requestIp(request)}`,
    limit: 10,
    windowSeconds: 60,
  });
  if (!limit.allowed) return rateLimitedResponse(limit);

  const { id } = await params;
  const url = new URL(request.url);
  if (url.searchParams.get("scope") === "section") {
    return sectionPdf(id);
  }
  const version =
    url.searchParams.get("version") === "draft" ? "draft" : "published";

  const [page] = await db.select().from(pages).where(eq(pages.id, id));
  if (!page) return new Response("Not found", { status: 404 });

  // drafts and internal pages require a signed-in team member
  const needsSession =
    version === "draft" || page.effectiveVisibility === "internal";
  if (needsSession) {
    const session = await auth();
    if (!session?.user) return new Response("Unauthorized", { status: 401 });
  }

  let title: string;
  let markdown: string;
  if (version === "draft") {
    title = page.title;
    markdown = page.contentMd;
  } else {
    if (page.publishedContentMd === null || page.publishedTitle === null) {
      return new Response("Not found", { status: 404 });
    }
    title = page.publishedTitle;
    markdown = page.publishedContentMd;
  }

  const html = renderPdfHtml({ title, markdown });

  // site-default header/footer, unless the page opted out
  const chrome = page.pdfChrome
    ? await getSettings(db, [PDF_HEADER_KEY, PDF_FOOTER_KEY, PDF_LOGO_KEY])
    : {};

  // a configured logo turns the export into cover page + content; inline it
  // as a data URI so Chromium renders it without network access
  const logoSrc = chrome[PDF_LOGO_KEY]
    ? await fetchLogoAsDataUri(chrome[PDF_LOGO_KEY])
    : null;
  const templateCtx = { title, url: `${siteUrl()}/${page.path}` };
  const headerTemplate = chrome[PDF_HEADER_KEY]
    ? buildPdfTemplate(chrome[PDF_HEADER_KEY], templateCtx)
    : "<span></span>";
  const footerTemplate = chrome[PDF_FOOTER_KEY]
    ? buildPdfTemplate(chrome[PDF_FOOTER_KEY], templateCtx)
    : defaultFooterTemplate(title);

  const browser = await launchBrowser();
  try {
    const browserPage = await browser.newPage();
    await browserPage.setContent(html, { waitUntil: "load" });
    // let remote images (Vercel Blob) finish loading
    await browserPage
      .evaluate(() =>
        Promise.all(
          Array.from(document.images)
            .filter((img) => !img.complete)
            .map(
              (img) =>
                new Promise((resolve) => {
                  img.onload = img.onerror = resolve;
                }),
            ),
        ),
      )
      .catch(() => {});

    const contentPdf = await browserPage.pdf({
      format: "letter",
      printBackground: true,
      margin: {
        top: chrome[PDF_HEADER_KEY] ? "0.9in" : "0.75in",
        bottom: "0.9in",
        left: "0.75in",
        right: "0.75in",
      },
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
    });

    let pdf: Uint8Array = new Uint8Array(contentPdf);
    if (logoSrc) {
      // clean cover page (no header/footer) merged in front — content page
      // numbers keep starting at 1
      await browserPage.setContent(buildCoverHtml({ title, logoSrc }), {
        waitUntil: "load",
      });
      const coverPdf = await browserPage.pdf({
        format: "letter",
        printBackground: true,
        margin: { top: "0", bottom: "0", left: "0", right: "0" },
      });
      pdf = await mergePdfs([new Uint8Array(coverPdf), pdf]);
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${page.slug}${version === "draft" ? "-draft" : ""}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}

const SECTION_PAGE_CAP = 25;

/**
 * Whole-section export: logo cover + table of contents + every published
 * page in the subtree, with continuous page numbers stamped after merging
 * (Chromium numbers each rendered document separately).
 */
async function sectionPdf(rootId: string): Promise<Response> {
  const all = await db
    .select({
      id: pages.id,
      parentId: pages.parentId,
      position: pages.position,
      slug: pages.slug,
      title: pages.publishedTitle,
      contentMd: pages.publishedContentMd,
      visibility: pages.effectiveVisibility,
    })
    .from(pages)
    .orderBy(pages.position);

  const byParent = new Map<string | null, typeof all>();
  for (const row of all) {
    if (!byParent.has(row.parentId)) byParent.set(row.parentId, []);
    byParent.get(row.parentId)!.push(row);
  }
  const root = all.find((p) => p.id === rootId);
  if (!root || root.contentMd === null) {
    return new Response("Not found", { status: 404 });
  }

  const session = await auth();
  // anonymous callers never see internal pages — including the root (404,
  // not 401, to avoid leaking existence)
  if (!session?.user && root.visibility === "internal") {
    return new Response("Not found", { status: 404 });
  }

  type Row = (typeof all)[number];
  const section: { row: Row; depth: number }[] = [];
  const walk = (row: Row, depth: number) => {
    if (!session?.user && row.visibility === "internal") return;
    if (row.contentMd !== null) section.push({ row, depth });
    for (const child of byParent.get(row.id) ?? []) walk(child, depth + 1);
  };
  walk(root, 0);

  if (section.length > SECTION_PAGE_CAP) {
    return new Response(
      `Section too large for one export (${section.length} pages, cap ${SECTION_PAGE_CAP}). Export sub-sections instead.`,
      { status: 413 },
    );
  }

  const chrome = await getSettings(db, [PDF_LOGO_KEY]);
  const logoSrc = chrome[PDF_LOGO_KEY]
    ? await fetchLogoAsDataUri(chrome[PDF_LOGO_KEY])
    : null;
  const sectionTitle = root.title ?? "Untitled";

  const browser = await launchBrowser();
  try {
    const browserPage = await browser.newPage();
    const renderPdf = async (
      html: string,
      margins: { top: string; bottom: string; left: string; right: string },
    ) => {
      await browserPage.setContent(html, { waitUntil: "load" });
      await browserPage
        .evaluate(() =>
          Promise.all(
            Array.from(document.images)
              .filter((img) => !img.complete)
              .map(
                (img) =>
                  new Promise((resolve) => {
                    img.onload = img.onerror = resolve;
                  }),
              ),
          ),
        )
        .catch(() => {});
      return new Uint8Array(
        await browserPage.pdf({
          format: "letter",
          printBackground: true,
          margin: margins,
        }),
      );
    };

    const contentMargins = {
      top: "0.75in",
      bottom: "0.9in",
      left: "0.75in",
      right: "0.75in",
    };
    const parts: Uint8Array[] = [];
    const partPageCounts: number[] = [];
    for (const { row } of section) {
      const part = await renderPdf(
        renderPdfHtml({
          title: row.title ?? "Untitled",
          markdown: row.contentMd!,
        }),
        contentMargins,
      );
      parts.push(part);
      partPageCounts.push(await countPages(part));
    }

    // content page numbers start at 1 after the front matter
    let cursor = 1;
    const tocEntries = section.map(({ row, depth }, i) => {
      const entry = {
        title: row.title ?? "Untitled",
        depth,
        page: cursor,
      };
      cursor += partPageCounts[i];
      return entry;
    });

    const coverPdf = await renderPdf(
      buildCoverHtml({ title: sectionTitle, logoSrc }),
      { top: "0", bottom: "0", left: "0", right: "0" },
    );
    const tocPdf = await renderPdf(
      buildTocHtml({ sectionTitle, entries: tocEntries }),
      contentMargins,
    );
    const frontMatter =
      (await countPages(coverPdf)) + (await countPages(tocPdf));

    const merged = await mergePdfs([coverPdf, tocPdf, ...parts]);
    const stamped = await stampFooters(merged, {
      leftText: `${sectionTitle} — Dash Marketing Docs`,
      skipPages: frontMatter,
    });

    return new Response(new Uint8Array(stamped), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${root.slug}-section.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
