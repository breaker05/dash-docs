# Dash Docs

Docs and user-guide platform for [docs.dashmarketing.io](https://docs.dashmarketing.io).
Public visitors read published pages; anyone with a **@dashmarketing.io** Google
account signs in to create, edit, organize, and (admins) publish pages.

**Stack:** Next.js (App Router) · Neon Postgres + Drizzle · Auth.js v5 (Google) ·
Markdoc rendering · TipTap WYSIWYG (markdown is the source of truth) ·
Tailwind + shadcn/ui · Vercel.

## Features

### Authoring

- **WYSIWYG editor** (TipTap) with a raw-markdown mode toggle — content is
  always stored as markdown, rendered publicly with
  [Markdoc](https://markdoc.dev)
- **Callouts** (`{% callout type="note|warning|success|danger" %}`) editable
  directly in the visual editor, plus tables (with row/column editing),
  code blocks, strikethrough, dividers, and undo/redo
- **Page linking** — the link button searches existing pages by title or path
  (drafts badged) and inserts clean relative links; external URLs still work
- **Image uploads** to Vercel Blob (drag/paste into the editor), rendered
  publicly with a subtle card treatment
- **Indentation-safe pasting** — leading spaces in pasted diagram-style text
  are preserved end-to-end (encoded as `&nbsp;` entities so markdown keeps
  them)

### Organization & publishing

- **Drag-and-drop page tree** with nesting and collapsible sections;
  moves/renames keep old URLs working via automatic redirects
- **Draft / publish** workflow — editing never changes the live site until an
  admin (re-)publishes; **version history** with diff, preview, and restore
- **Internal pages** — mark a page or section Internal (inherits down the
  tree) and it is only visible to signed-in team members
- **Page icons**, **feature tags** (browsable at `/tags`, filterable in
  search), and basic **user management** (editor/admin roles)

### Consumption

- **Full-text search** (Postgres) over published content incl. code blocks,
  with tag filtering
- **MCP server** at `/api/mcp` — see [MCP server](#mcp-server) below
- **Raw markdown everywhere**: append `.md` to any page URL; `/llms.txt`
  indexes all public pages for AI tools
- **PDF export** of any page (Chromium print rendering) with a site-wide
  header/footer template and an optional logo title page — configured in
  Admin → Settings, per-page opt-out in the editor
- **Google Analytics** — paste a GA4 measurement ID (or the whole gtag
  snippet) in Admin → Settings; loads on public pages only
- **Ask AI** — retrieval-grounded chat over the docs (Claude API; set
  `ANTHROPIC_API_KEY` to enable) with cited sources; signed-in team members
  transparently get internal pages in retrieval
- **⌘K palette**, **/changelog** + weekly Slack digest (webhook in
  Settings, `CRON_SECRET` + vercel.json cron), **"Was this helpful?"**
  votes and zero-result-search reporting in Admin → Insights, and
  **section → PDF book** export (cover, TOC, continuous page numbers)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in (see below)
npm run db:migrate           # applies drizzle/ migrations to Neon
npm run dev
```

Environment (`.env.local`):

| Var | What |
| --- | --- |
| `DATABASE_URL` | Neon **pooled** connection string |
| `DATABASE_URL_UNPOOLED` | Neon direct connection (migrations only) |
| `AUTH_SECRET` | `npx auth secret` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client (Internal type, dashmarketing.io Workspace). Redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://docs.dashmarketing.io/api/auth/callback/google` |
| `AUTH_ALLOWED_DOMAIN` | `dashmarketing.io` |
| `BLOB_READ_WRITE_TOKEN` | auto on Vercel with a Blob store attached; locally `vercel env pull` |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, prod URL on Vercel |

First admin (everyone signs in as `editor` by default):

```sql
UPDATE "user" SET role = 'admin' WHERE email = 'you@dashmarketing.io';
```

Testing a **production build** locally needs one extra variable (Vercel sets
it automatically in real deployments):

```bash
npm run build && AUTH_TRUST_HOST=true PORT=4100 npm start
```

## MCP server

The site exposes a read-only [Model Context Protocol](https://modelcontextprotocol.io)
server at `/api/mcp` (Streamable HTTP). Anonymous connections see **published,
public** pages only — never drafts or internal content. `/mcp` on the public
site documents this for visitors.

Tools: `search_docs` (full-text search), `get_page` (full markdown by path),
`list_pages` (tree of titles and paths).

### Connecting clients

Claude Code:

```bash
claude mcp add --transport http dash-docs https://docs.dashmarketing.io/api/mcp
```

Cursor (`mcp.json`):

```json
{
  "mcpServers": {
    "dash-docs": { "url": "https://docs.dashmarketing.io/api/mcp" }
  }
}
```

Claude.ai / Claude Desktop: Settings → Connectors → Add custom connector with
the endpoint URL. Most other MCP-capable tools accept the same URL as a
remote HTTP server. Against a local dev server, use
`http://localhost:3000/api/mcp`.

### Internal docs for team systems (API keys)

Admins mint API keys under **Admin → Settings → MCP API keys** (the raw key
is shown once; only a SHA-256 hash is stored; keys can be revoked and, once
revoked, deleted). A valid key sent as a bearer header unlocks **internal**
published pages through the same tools — for team chatbots, Claude Code,
skills, and other internal services:

```bash
claude mcp add --transport http dash-docs https://docs.dashmarketing.io/api/mcp \
  --header "Authorization: Bearer dashdocs_…"
```

A presented-but-invalid key is rejected with `401` — it is never silently
downgraded to public-only results.

### Input handling

- `search_docs` queries run as parameterized Postgres full-text search
  (`websearch_to_tsquery`) — input is never interpolated into SQL.
- `get_page` paths are database keys, not filesystem paths. Input is
  normalized and validated (slug segments only); dots, backslashes, control
  characters, and traversal sequences are rejected.

## Rate limiting

Fixed-window limits, stored in Postgres (`rate_limit` table) so they hold
across serverless instances. Exceeding a limit returns `429` with a
`Retry-After` header.

| Scope | Limit | Keyed by |
| --- | --- | --- |
| MCP, anonymous | 60 / min | IP |
| MCP, with API key | 300 / min | key |
| MCP, invalid API key attempts | 10 / min | IP |
| PDF export | 10 / min | IP |

The helper (`src/server/rate-limit.ts` → `checkRateLimit`) is reusable —
adding a limit to another route is a three-line change.

## Database migrations

```bash
npm run db:generate   # after editing src/db/schema.ts → SQL in drizzle/
npm run db:migrate    # apply to the DB in DATABASE_URL_UNPOOLED
```

Migrations are committed and run manually from a dev machine — including
against **prod Neon before each deploy** that adds one. Never use
`drizzle-kit push`.

## Tests

```bash
npm test              # vitest — PGlite (real Postgres) DB tests,
                      # TipTap↔markdown round-trip tests, hydration tests
npm run typecheck
npm run lint
```

## Deploying (Vercel)

1. Vercel project from this repo; env vars above (prod values); attach a
   **Blob store** (sets `BLOB_READ_WRITE_TOKEN`).
2. `npm run db:migrate` against the prod Neon database.
3. Push to deploy; smoke-test on `*.vercel.app`.
4. Custom domain: add `docs.dashmarketing.io` in Vercel and point the DNS
   CNAME at `cname.vercel-dns.com`.
