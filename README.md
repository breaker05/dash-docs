# Dash Docs

Docs and user-guide platform for [docs.dashmarketing.io](https://docs.dashmarketing.io).
Public visitors read published pages; anyone with a **@dashmarketing.io** Google
account signs in to create, edit, organize, and (admins) publish pages.

**Stack:** Next.js (App Router) · Neon Postgres + Drizzle · Auth.js v5 (Google) ·
Markdoc rendering · TipTap WYSIWYG (markdown is the source of truth) ·
Tailwind + shadcn/ui · Vercel.

## Features

- **WYSIWYG editor** (TipTap) with a raw-markdown mode toggle — content is always
  stored as markdown, rendered publicly with [Markdoc](https://markdoc.dev)
  (`{% callout type="note|warning|success|danger" %}` supported)
- **Drag-and-drop page tree** with nesting; moves/renames keep old URLs working
  via automatic redirects
- **Draft / publish** workflow — editing never changes the live site until an
  admin re-publishes
- **Internal pages** — mark a page or section Internal and it is only visible to
  signed-in team members (PTO policies etc.)
- **Version history** with diff, preview, and restore
- **Feature tags** and basic **user management** (editor/admin roles)
- **Full-text search** (Postgres) over published content incl. code blocks
- **MCP server** at `/api/mcp` so Claude and other agents can search/read the
  public docs
- **PDF export** of any page (Chromium print rendering)
- **Image uploads** to Vercel Blob (drag/paste into the editor)

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

## Importing the legacy docs

One-time (idempotent — safe to re-run):

```bash
npx tsx scripts/import-legacy.ts /path/to/dash-docs
```

Imports the three legacy markdown docs (published, links rewritten), creates
redirects for the old GitHub Pages URLs, and copies
`security-overview.html` + the Postman collection into `public/`.

## Database migrations

```bash
npm run db:generate   # after editing src/db/schema.ts → SQL in drizzle/
npm run db:migrate    # apply to the DB in DATABASE_URL_UNPOOLED
```

Migrations are committed and run manually from a dev machine. Never use
`drizzle-kit push`.

## Tests

```bash
npm test        # vitest — includes PGlite (real Postgres) DB tests and
                # TipTap↔markdown round-trip tests against the legacy docs
npm run typecheck
```

## Deploying (Vercel)

1. Create a Vercel project from this repo; add the env vars above (prod
   values), attach a **Blob store** (sets `BLOB_READ_WRITE_TOKEN`).
2. `npm run db:migrate` against the prod Neon database.
3. Deploy; run the import script against prod; smoke-test on `*.vercel.app`.
4. Add the `docs.dashmarketing.io` domain in Vercel → switch the DNS CNAME
   from GitHub Pages to `cname.vercel-dns.com` → remove the custom domain
   from the old `dash-docs` repo and archive it.

## MCP for Claude

```bash
claude mcp add --transport http dashdocs https://docs.dashmarketing.io/api/mcp
```

Tools: `search_docs`, `get_page`, `list_pages` (published public content only).
