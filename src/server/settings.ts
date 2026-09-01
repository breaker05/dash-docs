import { eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { settings } from "@/db/schema";
import {
  resolveAskModel,
  resolveAskEffort,
  type AskModel,
  type AskEffort,
} from "@/lib/ask-models";

export const PDF_HEADER_KEY = "pdf.headerText";
export const PDF_FOOTER_KEY = "pdf.footerText";
export const PDF_LOGO_KEY = "pdf.logoUrl";
export const GA_ID_KEY = "analytics.gaId";
export const SLACK_WEBHOOK_KEY = "slack.webhookUrl";
export const ANTHROPIC_KEY_SETTING = "ai.anthropicApiKey";
// present (any value) → chat is temporarily switched off; the key is kept
export const ASK_DISABLED_KEY = "ai.chatDisabled";
// which model answers the chat; unset → the default (see resolveAskModel)
export const ASK_MODEL_KEY = "ai.chatModel";
// reasoning effort for thinking-capable models; unset → the default
export const ASK_EFFORT_KEY = "ai.chatEffort";

/**
 * Ask AI configuration: the API key (environment variable wins, otherwise
 * the admin-saved setting), the temporary on/off switch, the model to answer
 * with, and the reasoning effort for thinking-capable models. The chat runs
 * only when a key exists AND it hasn't been switched off.
 */
export async function getAskConfig(db: Db): Promise<{
  apiKey: string | null;
  enabled: boolean;
  model: AskModel;
  effort: AskEffort;
}> {
  const values = await getSettings(db, [
    ANTHROPIC_KEY_SETTING,
    ASK_DISABLED_KEY,
    ASK_MODEL_KEY,
    ASK_EFFORT_KEY,
  ]);
  const apiKey =
    process.env.ANTHROPIC_API_KEY || values[ANTHROPIC_KEY_SETTING] || null;
  return {
    apiKey,
    enabled: apiKey !== null && !values[ASK_DISABLED_KEY],
    model: resolveAskModel(values[ASK_MODEL_KEY]),
    effort: resolveAskEffort(values[ASK_EFFORT_KEY]),
  };
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
