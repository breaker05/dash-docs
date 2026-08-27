/**
 * Title/cover page for PDF exports. Rendered as its own single-page PDF
 * (no header/footer chrome) and merged in front of the content pages, so
 * the cover stays clean and content page numbers start at 1.
 */

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildCoverHtml(opts: {
  title: string;
  /** data: URI or absolute URL for the logo image; omit for a text-only cover */
  logoSrc?: string | null;
  siteName?: string;
  date?: Date;
}): string {
  const date = (opts.date ?? new Date()).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const siteName = opts.siteName ?? "Dash Marketing Docs";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1a1a; margin: 0;
  }
  .cover {
    height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
    padding: 0 1in 12vh;
  }
  .cover img.logo {
    max-width: 280px; max-height: 90px; object-fit: contain;
    margin-bottom: 44px;
  }
  h1 {
    font-size: 32px; line-height: 1.25; font-weight: 650;
    letter-spacing: -0.02em; margin: 0 0 24px; max-width: 5.6in;
    overflow-wrap: break-word;
  }
  .rule { width: 48px; border-top: 3px solid #4f46e5; margin-bottom: 24px; }
  .meta { font-size: 12px; color: #71717a; letter-spacing: 0.01em; }
  .meta span + span::before { content: "·"; margin: 0 8px; color: #d4d4d8; }
</style>
</head>
<body>
<div class="cover">
  ${opts.logoSrc ? `<img class="logo" src="${escapeHtml(opts.logoSrc)}" alt="">` : ""}
  <h1>${escapeHtml(opts.title)}</h1>
  <div class="rule"></div>
  <p class="meta"><span>${escapeHtml(siteName)}</span><span>${escapeHtml(date)}</span></p>
</div>
</body>
</html>`;
}

/** Table-of-contents page for section exports (dotted leaders, indented by depth). */
export function buildTocHtml(opts: {
  sectionTitle: string;
  entries: { title: string; depth: number; page: number }[];
}): string {
  const rows = opts.entries
    .map(
      (e) => `<li style="padding-left:${e.depth * 18}px">
  <span class="t">${escapeHtml(e.title)}</span><span class="dots"></span><span class="n">${e.page}</span>
</li>`,
    )
    .join("\n");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    color: #1a1a1a; margin: 0; font-size: 12px;
  }
  h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: -0.01em; }
  p.sub { margin: 0 0 24px; color: #71717a; font-size: 11px; }
  ol { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: baseline; gap: 8px; padding-top: 9px; }
  .t { flex-shrink: 1; min-width: 0; }
  .dots { flex: 1; border-bottom: 1px dotted #d4d4d8; }
  .n { color: #71717a; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<h1>Contents</h1>
<p class="sub">${escapeHtml(opts.sectionTitle)}</p>
<ol>
${rows}
</ol>
</body>
</html>`;
}

/** Fetch an image and inline it as a data: URI so Chromium never needs the network. */
export async function fetchLogoAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/png";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 5_000_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
