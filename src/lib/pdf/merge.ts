import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** Concatenate PDFs in order into a single document. */
export async function mergePdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const part of parts) {
    const doc = await PDFDocument.load(part);
    const pages = await out.copyPages(doc, doc.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}

export async function countPages(pdf: Uint8Array): Promise<number> {
  return (await PDFDocument.load(pdf)).getPageCount();
}

/** Standard Helvetica can only encode WinAnsi — strip anything else. */
export function winAnsiSafe(s: string): string {
  // ASCII + Latin-1 + the common typographic marks WinAnsi carries
  // eslint-disable-next-line no-misleading-character-class
  return s.replace(
    /[^\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u2026]/g,
    "",
  );
}

/**
 * Stamp continuous footers onto a merged document — Chromium numbers each
 * rendered document separately, so section exports get their numbering here
 * instead. Front-matter pages (cover, TOC) are skipped and page 1 is the
 * first content page.
 */
export async function stampFooters(
  pdf: Uint8Array,
  opts: { leftText: string; skipPages: number },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length - opts.skipPages;
  const gray = rgb(0.44, 0.44, 0.48);
  const left = winAnsiSafe(opts.leftText);

  for (let i = opts.skipPages; i < pages.length; i++) {
    const page = pages[i];
    const { width } = page.getSize();
    const n = i - opts.skipPages + 1;
    const right = `Page ${n} of ${total}`;
    const rightWidth = font.widthOfTextAtSize(right, 8);
    page.drawText(left, { x: 54, y: 36, size: 8, font, color: gray });
    page.drawText(right, {
      x: width - 54 - rightWidth,
      y: 36,
      size: 8,
      font,
      color: gray,
    });
  }
  return doc.save();
}
