import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";

export const runtime = "nodejs";

/**
 * llms.txt — the convention LLM tools use to discover docs content.
 * Lists every published public page with a link to its raw markdown.
 */
export async function GET() {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://docs.dashmarketing.io";
  const rows = await db
    .select({
      title: pages.publishedTitle,
      path: pages.path,
      plain: pages.publishedPlain,
    })
    .from(pages)
    .where(
      and(
        isNotNull(pages.publishedContentMd),
        eq(pages.effectiveVisibility, "public"),
      ),
    )
    .orderBy(asc(pages.position));

  const lines = [
    "# Dash Marketing Docs",
    "",
    "> Documentation and API reference for the Dash Marketing platform.",
    "",
    `MCP server (search_docs, get_page, list_pages): ${site}/api/mcp — setup guide: ${site}/mcp`,
    "",
    "## Docs",
    "",
    ...rows.map((r) => {
      const summary = (r.plain ?? "").slice(0, 120).replace(/\s+\S*$/, "");
      return `- [${r.title}](${site}/${r.path}.md)${summary ? `: ${summary}…` : ""}`;
    }),
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
