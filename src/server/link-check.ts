import { isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { pages, redirects } from "@/db/schema";

/** Non-page routes internal links may legitimately point at. */
const RESERVED_PREFIXES = [
  "api/",
  "search",
  "tags",
  "mcp",
  "llms.txt",
  "changelog",
  "signin",
  "admin",
];

const LINK_RE = /\]\((\/[^)\s]*)\)/g;

/** Site-relative link targets in a markdown string. */
export function extractInternalLinks(markdown: string): string[] {
  const out: string[] = [];
  for (const match of markdown.matchAll(LINK_RE)) {
    const href = match[1];
    if (href.startsWith("//")) continue; // protocol-relative external
    out.push(href);
  }
  return out;
}

/** Mirror of findRedirect's normalization: strip anchor/query, .html, case. */
export function normalizeLinkTarget(href: string): string {
  return normalizeLinkTargetKeepExt(href).replace(/\.(html|md)$/i, "");
}

function normalizeLinkTargetKeepExt(href: string): string {
  return href
    .split("#")[0]
    .split("?")[0]
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

export type BrokenLink = {
  pageId: string;
  pageTitle: string;
  pagePath: string;
  href: string;
  in: "draft" | "published";
};

/**
 * Scan every page's draft and published markdown for internal links that no
 * longer resolve to a page path or a redirect. Docs scale — full scan per
 * request is fine.
 */
export async function findBrokenLinks(db: Db): Promise<BrokenLink[]> {
  const [allPages, allRedirects] = await Promise.all([
    db
      .select({
        id: pages.id,
        title: pages.title,
        path: pages.path,
        contentMd: pages.contentMd,
        publishedContentMd: pages.publishedContentMd,
      })
      .from(pages),
    db
      .select({ fromPath: redirects.fromPath })
      .from(redirects)
      .where(isNotNull(redirects.fromPath)),
  ]);

  const valid = new Set<string>(["", ...allRedirects.map((r) => r.fromPath)]);
  for (const p of allPages) valid.add(p.path.toLowerCase());

  const broken: BrokenLink[] = [];
  for (const page of allPages) {
    const sources: ["draft" | "published", string | null][] = [
      ["draft", page.contentMd],
      ["published", page.publishedContentMd],
    ];
    for (const [kind, markdown] of sources) {
      if (!markdown) continue;
      const seen = new Set<string>();
      for (const href of extractInternalLinks(markdown)) {
        if (seen.has(href)) continue;
        seen.add(href);
        // targets with a file extension point at static assets (Postman
        // collections, legacy .html files served from public/) — those
        // can't be verified against the page table, so skip them; .md is
        // the page-alias exception and is verified after stripping
        const last =
          normalizeLinkTargetKeepExt(href).split("/").pop() ?? "";
        if (last.includes(".") && !/\.md$/i.test(last)) continue;
        const target = normalizeLinkTarget(href);
        if (valid.has(target)) continue;
        if (RESERVED_PREFIXES.some((p) => target === p.replace(/\/$/, "") || target.startsWith(p))) {
          continue;
        }
        broken.push({
          pageId: page.id,
          pageTitle: page.title,
          pagePath: page.path,
          href,
          in: kind,
        });
      }
    }
  }
  return broken;
}
