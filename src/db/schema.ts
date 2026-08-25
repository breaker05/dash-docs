import {
  boolean,
  customType,
  index,
  integer,
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

export type Page = typeof pages.$inferSelect;
export type PageRevision = typeof pageRevisions.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type User = typeof users.$inferSelect;
