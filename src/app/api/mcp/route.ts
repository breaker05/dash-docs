import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { eq, isNotNull, and, asc, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { searchPages } from "@/server/search";
import { verifyApiKey } from "@/server/api-keys";
import {
  getContextDocByName,
  listContextDocsForMcp,
} from "@/server/context-docs";
import { normalizePagePath } from "@/lib/page-path";
import {
  checkRateLimit,
  rateLimitedResponse,
  requestIp,
} from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// Read-only MCP server over PUBLISHED docs. Anonymous requests see public
// pages only. A valid API key (Authorization: Bearer dashdocs_…, minted in
// Admin → Settings) additionally unlocks internal pages for team tools.

function publishedFilter(includeInternal: boolean): SQL {
  return includeInternal
    ? isNotNull(pages.publishedContentMd)
    : and(
        isNotNull(pages.publishedContentMd),
        eq(pages.effectiveVisibility, "public"),
      )!;
}

function buildHandler(includeInternal: boolean) {
  const scopeNote = includeInternal
    ? " Includes internal team-only pages (authorized access)."
    : "";
  return createMcpHandler((server) => {
    server.registerTool(
      "search_docs",
      {
        title: "Search Dash Marketing docs",
        description:
          `Full-text search over the published Dash Marketing documentation (API reference, guides). Returns matching pages with paths and snippets; fetch full content with get_page. The query runs as a parameterized Postgres full-text search (websearch_to_tsquery) — input is bound as a query value, never interpolated into SQL.${scopeNote}`,
        inputSchema: z.object({
          query: z.string().min(1).max(200).describe("Search terms"),
          limit: z.number().int().min(1).max(50).optional(),
        }),
      },
      async ({ query, limit }) => {
        const hits = await searchPages(db, {
          query,
          includeInternal,
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
          `Fetch the full markdown content of a published documentation page by its path (as returned by search_docs or list_pages). The path is a page identifier — slug segments separated by "/" — used as a parameterized database key, never a filesystem path. Input is normalized and validated server-side (lowercased; only letters, digits, dashes, and underscores per segment); dots, backslashes, and traversal sequences are rejected.${scopeNote}`,
        inputSchema: z.object({
          path: z
            .string()
            .min(1)
            .max(300)
            .describe("Page path, e.g. lead-submission-api"),
        }),
      },
      async ({ path }) => {
        const normalized = normalizePagePath(path);
        if (!normalized) {
          return {
            content: [
              {
                type: "text" as const,
                text: 'Invalid page path. Paths are slug identifiers like "api-documentation/lead-submission-api" — segments of letters, digits, dashes, and underscores separated by "/".',
              },
            ],
            isError: true,
          };
        }
        const [page] = await db
          .select()
          .from(pages)
          .where(
            and(eq(pages.path, normalized), publishedFilter(includeInternal)),
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
          `List all published documentation pages as an indented tree of titles and paths.${scopeNote}`,
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
            visibility: pages.effectiveVisibility,
          })
          .from(pages)
          .where(publishedFilter(includeInternal))
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
            const badge =
              includeInternal && row.visibility === "internal"
                ? " [internal]"
                : "";
            lines.push(`${"  ".repeat(depth)}- ${row.title} (${row.path})${badge}`);
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

    // reference files (API specs, schemas) — authorized (keyed) access only
    if (includeInternal) {
      server.registerTool(
        "list_context_files",
        {
          title: "List reference context files",
          description:
            "List the team's uploaded reference files (API specs, schemas, notes) that supplement the docs — not pages. Fetch one with get_context_file.",
          inputSchema: z.object({}),
        },
        async () => {
          const docs = await listContextDocsForMcp(db);
          const text =
            docs.length === 0
              ? "No context files uploaded."
              : docs
                  .map(
                    (d) =>
                      `- ${d.name} (${d.filename}, ${d.contentType}, ${d.bytes} bytes)`,
                  )
                  .join("\n");
          return { content: [{ type: "text", text }] };
        },
      );

      server.registerTool(
        "get_context_file",
        {
          title: "Get a reference context file",
          description:
            "Fetch the full content of an uploaded reference file by its name (as returned by list_context_files) — e.g. the API's OpenAPI/Swagger spec.",
          inputSchema: z.object({
            name: z
              .string()
              .min(1)
              .max(200)
              .describe("File name, e.g. Dash API Swagger"),
          }),
        },
        async ({ name }) => {
          const doc = await getContextDocByName(db, name);
          if (!doc) {
            return {
              content: [
                {
                  type: "text",
                  text: `No context file named "${name}". Use list_context_files to see what's available.`,
                },
              ],
              isError: true,
            };
          }
          return {
            content: [
              {
                type: "text",
                text: `# ${doc.name} (${doc.filename})\n\n${doc.content}`,
              },
            ],
          };
        },
      );
    }
  });
}

const publicHandler = buildHandler(false);
const internalHandler = buildHandler(true);

async function handler(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization");
  if (auth) {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    const key = match ? await verifyApiKey(db, match[1].trim()) : null;
    if (!key) {
      // a presented-but-invalid credential is an error, never a silent
      // downgrade to public-only results — and invalid attempts are
      // rate-limited by IP to slow down key guessing
      const limit = await checkRateLimit(db, {
        key: `mcp:badauth:${requestIp(request)}`,
        limit: 10,
        windowSeconds: 60,
      });
      if (!limit.allowed) return rateLimitedResponse(limit);
      return Response.json(
        { error: "Invalid or revoked API key" },
        { status: 401 },
      );
    }
    const limit = await checkRateLimit(db, {
      key: `mcp:key:${key.id}`,
      limit: 300,
      windowSeconds: 60,
    });
    if (!limit.allowed) return rateLimitedResponse(limit);
    return internalHandler(request);
  }
  const limit = await checkRateLimit(db, {
    key: `mcp:ip:${requestIp(request)}`,
    limit: 60,
    windowSeconds: 60,
  });
  if (!limit.allowed) return rateLimitedResponse(limit);
  return publicHandler(request);
}

export { handler as GET, handler as POST, handler as DELETE };
