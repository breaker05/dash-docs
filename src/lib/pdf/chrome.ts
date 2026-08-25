/**
 * Chromium header/footer templates for PDF export. Admin-authored plain
 * text with tokens; everything else is escaped, so no HTML injection into
 * the print chrome.
 *
 * Tokens: {title} {url} {date} {page} {pages}
 */

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildPdfTemplate(
  template: string,
  ctx: { title: string; url: string; date?: Date },
): string {
  const date = (ctx.date ?? new Date()).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const html = escapeHtml(template)
    .replaceAll("{title}", escapeHtml(ctx.title))
    .replaceAll("{url}", escapeHtml(ctx.url))
    .replaceAll("{date}", escapeHtml(date))
    .replaceAll("{page}", '<span class="pageNumber"></span>')
    .replaceAll("{pages}", '<span class="totalPages"></span>');
  // Chromium print templates need explicit font sizing; they render at
  // full page width with no default styles.
  return `<div style="width:100%;font-size:8px;color:#71717a;padding:0 0.75in;display:flex;justify-content:space-between;gap:16px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;">${html
    .split("|")
    .map((part) => `<span>${part.trim()}</span>`)
    .join("")}</div>`;
}

/** The footer used when no site default is configured. */
export function defaultFooterTemplate(title: string): string {
  return buildPdfTemplate("{title} — Dash Marketing Docs | Page {page} of {pages}", {
    title,
    url: "",
  });
}
