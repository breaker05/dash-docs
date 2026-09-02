import {
  bigserial,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

// ---------------------------------------------------------------------------
// Auth tables (shape required by @auth/drizzle-adapter, plus our `role`)
// ---------------------------------------------------------------------------

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  role: text("role", { enum: ["editor", "admin"] })
    .notNull()
    .default("editor"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------------------------------------------------------------------------
// Content tables
// ---------------------------------------------------------------------------

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const pages = pgTable(
  "page",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id").references((): AnyPgColumn => pages.id, {
      onDelete: "cascade",
    }),
    position: integer("position").notNull().default(0),
    slug: text("slug").notNull(),
    path: text("path").notNull(),
    isHome: boolean("is_home").notNull().default(false),
    visibility: text("visibility", { enum: ["public", "internal"] })
      .notNull()
      .default("public"),
    // lucide icon name from the curated set in src/lib/page-icons.tsx
    icon: text("icon"),
    // apply the site-default PDF header/footer (admin settings) on export
    pdfChrome: boolean("pdf_chrome").notNull().default(true),
    // internal if this page or any ancestor is internal; recomputed on move /
    // visibility change in the same transaction that recomputes `path`
    effectiveVisibility: text("effective_visibility", {
      enum: ["public", "internal"],
    })
      .notNull()
      .default("public"),

    // Draft (working copy)
    title: text("title").notNull().default("Untitled"),
    contentMd: text("content_md").notNull().default(""),

    // Published snapshot (what the public site renders)
    publishedTitle: text("published_title"),
    publishedContentMd: text("published_content_md"),
    publishedPlain: text("published_plain"),
    // plain uuid (not FK) to avoid a circular FK with page_revisions;
    // integrity is maintained by the publish transaction
    publishedRevisionId: uuid("published_revision_id"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: text("published_by").references(() => users.id),

    draftUpdatedAt: timestamp("draft_updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: text("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),

    search: tsvector("search").generatedAlwaysAs(
      (): ReturnType<typeof sql> =>
        sql`setweight(to_tsvector('english', coalesce("published_title", '')), 'A') || setweight(to_tsvector('english', coalesce("published_plain", '')), 'B')`,
    ),
  },
  (t) => [
    // NULLS NOT DISTINCT so root-level pages (parent_id IS NULL) also get
    // sibling-unique slugs (Postgres 15+)
    unique("page_parent_slug_unique").on(t.parentId, t.slug).nullsNotDistinct(),
    uniqueIndex("page_path_unique").on(t.path),
    uniqueIndex("page_home_unique").on(t.isHome).where(sql`${t.isHome}`),
    index("page_parent_position_idx").on(t.parentId, t.position),
    index("page_search_idx").using("gin", t.search),
  ],
);

export const pageRevisions = pgTable(
  "page_revision",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    contentMd: text("content_md").notNull(),
    kind: text("kind", {
      enum: ["publish", "manual", "pre_restore", "import"],
    }).notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("page_revision_page_version_idx").on(t.pageId, t.version)],
);

export const tags = pgTable("tag", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const pageTags = pgTable(
  "page_tag",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.tagId] })],
);

export const redirects = pgTable("redirect", {
  id: uuid("id").defaultRandom().primaryKey(),
  // stored lowercased; lookups lowercase the incoming path first
  fromPath: text("from_path").notNull().unique(),
  toPageId: uuid("to_page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const settings = pgTable("setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: text("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Who is editing which page right now (heartbeat upserts from the editor);
// rows older than a minute are considered gone.
export const editPresence = pgTable(
  "edit_presence",
  {
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userName: text("user_name").notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.userId] })],
);

// Anonymous reader feedback on public pages ("was this helpful?").
export const pageFeedback = pgTable("page_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  pageId: uuid("page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  helpful: boolean("helpful").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Public search queries with hit counts — zero-result rows are the
// "docs we should write next" signal surfaced in /admin/insights.
export const searchLog = pgTable("search_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  query: text("query").notNull(),
  resultCount: integer("result_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Reference files (Swagger JSON, specs, notes) that feed Ask AI retrieval
// and keyed MCP clients — never rendered as pages. Full content lives on the
// doc row (MCP serves it); retrieval works over the FTS-indexed chunks.
export const contextDocs = pgTable("context_doc", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  bytes: integer("bytes").notNull(),
  // public → may inform anonymous chat answers; internal → team chat only
  audience: text("audience", { enum: ["public", "internal"] })
    .notNull()
    .default("internal"),
  enabled: boolean("enabled").notNull().default(true),
  content: text("content").notNull(),
  updatedBy: text("updated_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contextChunks = pgTable(
  "context_chunk",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => contextDocs.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull(),
    content: text("content").notNull(),
    search: tsvector("search").generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`to_tsvector('english', "content")`,
    ),
  },
  (t) => [index("context_chunk_search_idx").using("gin", t.search)],
);

// Chunked published-page content for Ask AI retrieval — the semantic + keyword
// index over the docs themselves (the source of truth), rebuilt on publish and
// cleared on unpublish. Mirrors context_chunk: the pgvector `embedding` column
// lives only on Neon (raw SQL), kept out of Drizzle so the PGlite test DB works.
export const pageChunks = pgTable(
  "page_chunk",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull(),
    content: text("content").notNull(),
    search: tsvector("search").generatedAlwaysAs(
      (): ReturnType<typeof sql> => sql`to_tsvector('english', "content")`,
    ),
  },
  (t) => [
    index("page_chunk_search_idx").using("gin", t.search),
    index("page_chunk_page_idx").on(t.pageId),
  ],
);

// Fixed-window rate-limit counters (key embeds the window bucket).
// Postgres-backed so limits hold across serverless instances; expired rows
// are lazily cleaned up by the limiter itself.
export const rateLimits = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// API keys for machine access (MCP internal docs). Only a SHA-256 hash of
// the key is stored; the raw key is shown once at creation.
export const apiKeys = pgTable("api_key", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const assets = pgTable("asset", {
  id: uuid("id").defaultRandom().primaryKey(),
  blobUrl: text("blob_url").notNull(),
  pathname: text("pathname").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: text("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Ask AI conversations. Every chat (anonymous or signed-in) is persisted for
// admin review; signed-in members can also revisit their own. userId is null
// for anonymous visitors and set-null on member deletion so history survives.
export const conversations = pgTable("conversation", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  // truncated first question; a human-readable label for the list views
  title: text("title"),
  // snapshot of the settings the chat ran under (handy when reviewing)
  model: text("model").notNull(),
  effort: text("effort").notNull(),
  // whether internal pages were in retrieval scope (i.e. asked while signed in)
  includeInternal: boolean("include_internal").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messages = pgTable(
  "message",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // monotonic insertion order — timestamps within a turn can collide
    seq: bigserial("seq", { mode: "number" }).notNull(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    // cited sources for assistant turns: [{ n, title, path, kind }]
    sources: jsonb("sources").$type<MessageSource[]>(),
    // token usage + computed dollar cost for assistant turns (null for user
    // turns and for turns recorded before this shipped)
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    costUsd: doublePrecision("cost_usd"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("message_conversation_idx").on(t.conversationId, t.seq)],
);

export type MessageSource = {
  n: number;
  title: string;
  path: string;
  kind: "page" | "file";
};

export type Page = typeof pages.$inferSelect;
export type PageRevision = typeof pageRevisions.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type User = typeof users.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
