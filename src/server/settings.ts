import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";

export const PDF_HEADER_KEY = "pdf.headerText";
export const PDF_FOOTER_KEY = "pdf.footerText";
export const PDF_LOGO_KEY = "pdf.logoUrl";
export const GA_ID_KEY = "analytics.gaId";

export async function getSettings(
  db: Db,
  keys: string[],
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, keys));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(
  db: Db,
  opts: { key: string; value: string; userId: string },
): Promise<void> {
  if (opts.value.trim() === "") {
    await db.delete(settings).where(eq(settings.key, opts.key));
    return;
  }
  await db
    .insert(settings)
    .values({ key: opts.key, value: opts.value, updatedBy: opts.userId })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: opts.value,
        updatedBy: opts.userId,
        updatedAt: sql`now()`,
      },
    });
}
