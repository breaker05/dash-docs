import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { eq, isNotNull, and, asc } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { searchPages } from "@/server/search";

export const runtime = "nodejs";
export const maxDuration = 60;

// Public, read-only MCP server over PUBLISHED, PUBLIC docs only.
// Internal pages are never exposed here (an authed internal-docs MCP is a
// planned fast-follow).

const publicPublished = and(
  isNotNull(pages.publishedContentMd),
  eq(pages.effectiveVisibility, "public"),
);

const handler = createMcpHandler((server) => {
  server.registerTool(
    "search_docs",
    {
      title: "Search Dash Marketing docs",
      description:
        "Full-text search over the published Dash Marketing documentation (API reference, guides). Returns matching pages with paths and snippets; fetch full content with get_page.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Search terms"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    },
    async ({ query, limit }) => {
      const hits = await searchPages(db, {
        query,
        includeInternal: false,
        limit: limit ?? 10,
      });
      const text =
        hits.length === 0
          ? "No results."
          : hits
              .map(
                (h) =>
                  `- ${h.title} (path: ${h.path})\n  ${h.snippet.replaceAll("⟪", "").replaceAll("⟫", "")}`,
              )
              .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  server.registerTool(
    "get_page",
    {
      title: "Get a docs page",
      description:
        "Fetch the full markdown content of a published documentation page by its path (as returned by search_docs or list_pages).",
      inputSchema: z.object({
        path: z.string().describe("Page path, e.g. lead-submission-api"),
      }),
    },
    async ({ path }) => {
      const [page] = await db
        .select()
        .from(pages)
        .where(
          and(eq(pages.path, path.replace(/^\//, "")), publicPublished),
        );
      if (!page) {
        return {
          content: [
            { type: "text", text: `No published page at path "${path}".` },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text",
            text: `# ${page.publishedTitle}\n\n${page.publishedContentMd}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_pages",
    {
      title: "List docs pages",
      description:
        "List all published documentation pages as an indented tree of titles and paths.",
      inputSchema: z.object({}),
    },
    async () => {
      const rows = await db
        .select({
          id: pages.id,
          parentId: pages.parentId,
          title: pages.publishedTitle,
          path: pages.path,
          position: pages.position,
        })
        .from(pages)
        .where(publicPublished)
        .orderBy(asc(pages.position));

      const byParent = new Map<string | null, typeof rows>();
      const ids = new Set(rows.map((r) => r.id));
      for (const row of rows) {
        const key = row.parentId && ids.has(row.parentId) ? row.parentId : null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push(row);
      }
      const lines: string[] = [];
      const walk = (parent: string | null, depth: number) => {
        for (const row of byParent.get(parent) ?? []) {
          lines.push(`${"  ".repeat(depth)}- ${row.title} (${row.path})`);
          walk(row.id, depth + 1);
        }
      };
      walk(null, 0);
      return {
        content: [
          { type: "text", text: lines.join("\n") || "No published pages." },
        ],
      };
    },
  );
});

export { handler as GET, handler as POST, handler as DELETE };
