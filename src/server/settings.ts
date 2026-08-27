import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";

export const PDF_HEADER_KEY = "pdf.headerText";
export const PDF_FOOTER_KEY = "pdf.footerText";
export const PDF_LOGO_KEY = "pdf.logoUrl";
export const GA_ID_KEY = "analytics.gaId";
export const SLACK_WEBHOOK_KEY = "slack.webhookUrl";
export const ANTHROPIC_KEY_SETTING = "ai.anthropicApiKey";

/**
 * The Anthropic API key powering Ask AI: the environment variable wins,
 * otherwise the admin-saved setting. Returns null when neither is set
 * (the feature hides itself).
 */
export async function getAnthropicApiKey(db: Db): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const values = await getSettings(db, [ANTHROPIC_KEY_SETTING]);
  return values[ANTHROPIC_KEY_SETTING] ?? null;
}

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
