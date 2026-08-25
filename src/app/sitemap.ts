import type { MetadataRoute } from "next";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { siteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  // public published pages only — internal pages are never listed
  const rows = await db
    .select({ path: pages.path, isHome: pages.isHome, publishedAt: pages.publishedAt })
    .from(pages)
    .where(
      and(
        isNotNull(pages.publishedContentMd),
        eq(pages.effectiveVisibility, "public"),
      ),
    );
  return rows.map((r) => ({
    url: r.isHome ? base : `${base}/${r.path}`,
    lastModified: r.publishedAt ?? undefined,
  }));
}
