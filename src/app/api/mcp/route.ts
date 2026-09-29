import { createMcpHandler } from "mcp-handler";
import { revalidatePath } from "next/cache";
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
import { PAGE_ICONS } from "@/lib/page-icons";
import { siteUrl } from "@/lib/site-url";
import { AUTHORING_GUIDE, AUTHORING_WORKFLOW } from "@/lib/authoring-guide";
import {
  AuthoringError,
  createDraftPage,
  getDraft,
  listPageTree,
  updateDraftPage,
  uploadImageBase64,
  type Author,
} from "@/server/mcp-authoring";
import type { Page } from "@/db/schema";
import {
  checkRateLimit,
  rateLimitedResponse,
  requestIp,
} from "@/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

// MCP server over PUBLISHED docs. Anonymous requests see public pages only.
// A valid API key (Authorization: Bearer dashdocs_…, minted in Admin →
// Settings) additionally unlocks internal pages for team tools, and a
// write-enabled key also gets draft-authoring tools (create/update drafts,
// upload images) — publishing always stays a human step in the editor.

function publishedFilter(includeInternal: boolean): SQL {
  return includeInternal
    ? isNotNull(pages.publishedContentMd)
    : and(
        isNotNull(pages.publishedContentMd),
        eq(pages.effectiveVisibility, "public"),
      )!;
}

type Access = { includeInternal: boolean; author?: Author };

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

/** Run a write tool: AuthoringErrors become tool errors the model can act on. */
async function authoring(
  run: () => Promise<string>,
  { writes = true } = {},
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  try {
    const text = await run();
    if (writes) revalidatePath("/admin", "layout");
    return { content: [{ type: "text", text }] };
  } catch (e) {
    if (e instanceof AuthoringError) return errorResult(e.message);
    throw e;
  }
}

function describePage(page: Page, imagesUploaded: number): string {
  const lines = [
    `Saved draft "${page.title}"`,
    `path: ${page.path}`,
    `visibility: ${page.effectiveVisibility}`,
    `draftUpdatedAt: ${page.draftUpdatedAt.toISOString()}`,
    `review & publish: ${siteUrl()}/admin/pages/${page.id}`,
  ];
  if (imagesUploaded > 0) lines.push(`images uploaded: ${imagesUploaded}`);
  lines.push(
    page.publishedContentMd === null
      ? "Not published — it won't appear on the site until someone publishes it from the editor."
      : "The live page is unchanged until someone publishes this draft from the editor.",
  );
  return lines.join("\n");
}

function buildHandler({ includeInternal, author }: Access) {
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

    if (author) registerAuthoringTools(server, author);
  }, author ? { instructions: AUTHORING_WORKFLOW } : undefined);
}

type McpServer = Parameters<Parameters<typeof createMcpHandler>[0]>[0];

// draft authoring — write-enabled keys only
function registerAuthoringTools(server: McpServer, author: Author) {
  server.registerTool(
    "get_authoring_guide",
    {
      title: "Get the docs authoring guide",
      description:
        "Formatting rules and the recommended workflow for writing Dash docs pages (markdown conventions, callouts, links, images). Read before creating or editing pages.",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [
        { type: "text", text: `${AUTHORING_WORKFLOW}\n\n${AUTHORING_GUIDE}` },
      ],
    }),
  );

  server.registerTool(
    "list_page_tree",
    {
      title: "List all pages (including drafts)",
      description:
        "The full site structure as an indented tree — every page with its path and status (draft / published / published with unpublished changes, internal, home). Use it to choose where new docs belong and to find paths for links.",
      inputSchema: z.object({}),
    },
    async () => ({ content: [{ type: "text", text: await listPageTree(db) }] }),
  );

  server.registerTool(
    "get_draft",
    {
      title: "Get a page's current draft",
      description:
        "Fetch the working-copy (draft) markdown of any page by path, plus its status and draftUpdatedAt — pass that timestamp to update_page as expectedDraftUpdatedAt so you never overwrite a teammate's newer edits.",
      inputSchema: z.object({
        path: z.string().min(1).max(300).describe("Page path from list_page_tree"),
      }),
    },
    async ({ path }) =>
      authoring(async () => (await getDraft(db, path)).text, { writes: false }),
  );

  server.registerTool(
    "create_page",
    {
      title: "Create a docs page (draft)",
      description:
        "Create a new page as an unpublished DRAFT. Confirm the location with the user first unless they already specified it. Content is markdown per get_authoring_guide (don't repeat the title as a # heading). Inline base64 data: URI images are uploaded automatically; local file paths are rejected — upload them with upload_image first. " +
        `Returns the new page's path and an editor link where a human reviews and publishes it. Allowed icons: ${Object.keys(PAGE_ICONS).join(", ")}.`,
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        content: z.string().max(500_000).describe("Page body markdown"),
        parentPath: z
          .string()
          .max(300)
          .optional()
          .describe("Path of the parent page; omit for a top-level page"),
        position: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("0-based index among its siblings; omit to append at the end"),
        visibility: z
          .enum(["public", "internal"])
          .optional()
          .describe("internal = team-only. Omit to inherit from the parent (public at top level)"),
        icon: z.string().max(50).optional(),
      }),
    },
    async (input) =>
      authoring(async () => {
        const { page, imagesUploaded } = await createDraftPage(db, input, author);
        return describePage(page, imagesUploaded);
      }),
  );

  server.registerTool(
    "update_page",
    {
      title: "Update a docs page's draft",
      description:
        "Replace the draft title and/or full markdown content of an existing page. Read it with get_draft first and pass expectedDraftUpdatedAt. The previous draft is saved to the page's History so the change can be reverted; the live page is untouched until a human publishes. Refuses while someone has the page open in the editor. Same image rules as create_page.",
      inputSchema: z.object({
        path: z.string().min(1).max(300),
        title: z.string().min(1).max(200).optional(),
        content: z
          .string()
          .max(500_000)
          .optional()
          .describe("The complete new page body markdown (not a diff)"),
        expectedDraftUpdatedAt: z
          .string()
          .optional()
          .describe("draftUpdatedAt from get_draft — rejects the write if the draft changed since"),
      }),
    },
    async (input) =>
      authoring(async () => {
        const { page, imagesUploaded } = await updateDraftPage(db, input, author);
        return describePage(page, imagesUploaded);
      }),
  );

  server.registerTool(
    "upload_image",
    {
      title: "Upload an image",
      description:
        "Upload an image (png, jpeg, gif, webp, svg; max 10MB) to the docs' image storage — the same place the editor puts pasted/dragged images — and get back a hosted URL plus a markdown snippet to put in page content. " +
        `If you can run shell commands, prefer uploading local files directly instead of base64-encoding them: curl -sS -F "file=@path/to/image.png" -H "Authorization: Bearer $DASH_DOCS_KEY" ${siteUrl()}/api/upload (returns JSON {url, markdown}).`,
      inputSchema: z.object({
        filename: z.string().min(1).max(200).describe("e.g. webhook-settings.png"),
        contentType: z.enum([
          "image/png",
          "image/jpeg",
          "image/gif",
          "image/webp",
          "image/svg+xml",
        ]),
        dataBase64: z.string().min(1).describe("The image bytes, base64-encoded"),
        alt: z.string().max(300).optional().describe("Alt text for the returned markdown snippet"),
      }),
    },
    async ({ alt, ...input }) =>
      authoring(async () => {
        const { url } = await uploadImageBase64(db, input, author);
        return `url: ${url}\nmarkdown: ![${(alt ?? "").replace(/[[\]]/g, "")}](${url})`;
      }),
  );

  server.registerPrompt(
    "document_code",
    {
      title: "Write docs from this codebase",
      description:
        "Guided workflow: study the code, propose where the docs go, then write them into Dash Docs as drafts.",
      argsSchema: z.object({
        topic: z
          .string()
          .optional()
          .describe("What to document, e.g. 'the webhook retry system' (default: ask)"),
      }),
    },
    ({ topic }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `I want to document ${topic ? `"${topic}"` : "part of this codebase (ask me what)"} in Dash Docs.\n\n` +
              "Study the relevant code first. Then, before writing, show me a short plan: the page(s) you'll create or update, where each goes in the site tree (use list_page_tree), and whether it's public or internal — and wait for my OK. " +
              "Write for the docs' audience, not as a code walkthrough. Include screenshots or diagrams only if they help, uploaded via upload_image.\n\n" +
              AUTHORING_WORKFLOW,
          },
        },
      ],
    }),
  );
}

const publicHandler = buildHandler({ includeInternal: false });
const internalHandler = buildHandler({ includeInternal: true });

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
    if (key.canWrite && key.createdBy) {
      // per-request: the tools close over the key owner for attribution
      return buildHandler({
        includeInternal: true,
        author: { userId: key.createdBy },
      })(request);
    }
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
