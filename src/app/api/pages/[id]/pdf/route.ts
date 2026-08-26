import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { launchBrowser } from "@/lib/pdf/browser";
import { renderPdfHtml } from "@/lib/pdf/render-html";
import { buildPdfTemplate, defaultFooterTemplate } from "@/lib/pdf/chrome";
import { buildCoverHtml, fetchLogoAsDataUri } from "@/lib/pdf/cover";
import { mergePdfs } from "@/lib/pdf/merge";
import {
  getSettings,
  PDF_FOOTER_KEY,
  PDF_HEADER_KEY,
  PDF_LOGO_KEY,
} from "@/server/settings";
import { siteUrl } from "@/lib/site-url";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const version =
    new URL(request.url).searchParams.get("version") === "draft"
      ? "draft"
      : "published";

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
