"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin, requireEditor } from "@/server/auth-guards";
import {
  ANTHROPIC_KEY_SETTING,
  ASK_CORPUS_BUDGET_KEY,
  ASK_DISABLED_KEY,
  ASK_EFFORT_KEY,
  ASK_MODEL_KEY,
  GA_ID_KEY,
  PDF_FOOTER_KEY,
  PDF_HEADER_KEY,
  PDF_LOGO_KEY,
  SLACK_WEBHOOK_KEY,
  getSettings,
  setSetting,
} from "@/server/settings";
import { isAskEffort, isAskModelId, isCorpusBudget } from "@/lib/ask-models";
import { extractGaId } from "@/lib/analytics";
import { eq } from "drizzle-orm";
import { pages } from "@/db/schema";

export async function updatePdfSettingsAction(opts: {
  headerText: string;
  footerText: string;
}) {
  const user = await requireAdmin();
  await setSetting(db, {
    key: PDF_HEADER_KEY,
    value: opts.headerText,
    userId: user.id,
  });
  await setSetting(db, {
    key: PDF_FOOTER_KEY,
    value: opts.footerText,
    userId: user.id,
  });
  revalidatePath("/admin/settings");
}

export async function updateGaIdAction(opts: { value: string }) {
  const user = await requireAdmin();
  let id = "";
  if (opts.value.trim() !== "") {
    const extracted = extractGaId(opts.value);
    if (!extracted) {
      throw new Error(
        "No measurement ID found — paste the GA snippet or an ID like G-XXXXXXXXXX",
      );
    }
    id = extracted;
  }
  await setSetting(db, { key: GA_ID_KEY, value: id, userId: user.id });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function updateAnthropicKeyAction(opts: { value: string }) {
  const user = await requireAdmin();
  const value = opts.value.trim();
  if (value !== "" && !value.startsWith("sk-ant-")) {
    throw new Error("That doesn't look like an Anthropic API key (sk-ant-…)");
  }
  await setSetting(db, {
    key: ANTHROPIC_KEY_SETTING,
    value,
    userId: user.id,
  });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function updateAskModelAction(opts: { model: string }) {
  const user = await requireAdmin();
  if (!isAskModelId(opts.model)) {
    throw new Error("Unknown model");
  }
  await setSetting(db, {
    key: ASK_MODEL_KEY,
    value: opts.model,
    userId: user.id,
  });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function updateAskEffortAction(opts: { effort: string }) {
  const user = await requireAdmin();
  if (!isAskEffort(opts.effort)) {
    throw new Error("Unknown effort level");
  }
  await setSetting(db, {
    key: ASK_EFFORT_KEY,
    value: opts.effort,
    userId: user.id,
  });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function updateAskCorpusBudgetAction(opts: { budget: string }) {
  const user = await requireAdmin();
  if (!isCorpusBudget(opts.budget)) {
    throw new Error("Unknown corpus budget");
  }
  await setSetting(db, {
    key: ASK_CORPUS_BUDGET_KEY,
    value: opts.budget,
    userId: user.id,
  });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function setAskEnabledAction(opts: { enabled: boolean }) {
  const user = await requireAdmin();
  // empty value deletes the flag → enabled; any value → disabled
  await setSetting(db, {
    key: ASK_DISABLED_KEY,
    value: opts.enabled ? "" : "true",
    userId: user.id,
  });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
}

export async function updateSlackWebhookAction(opts: { url: string }) {
  const user = await requireAdmin();
  const url = opts.url.trim();
  if (url !== "" && !url.startsWith("https://hooks.slack.com/")) {
    throw new Error("Must be a Slack incoming-webhook URL (hooks.slack.com)");
  }
  await setSetting(db, { key: SLACK_WEBHOOK_KEY, value: url, userId: user.id });
  revalidatePath("/admin/settings");
}

export async function sendTestDigestAction(): Promise<{ count: number }> {
  await requireAdmin();
  const { formatDigest, postToSlack, recentPublishes } = await import(
    "@/server/digest"
  );
  const { siteUrl } = await import("@/lib/site-url");
  const settings = await getSettings(db, [SLACK_WEBHOOK_KEY]);
  const webhook = settings[SLACK_WEBHOOK_KEY];
  if (!webhook) throw new Error("Save a webhook URL first");
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const entries = await recentPublishes(db, {
    since,
    includeInternal: true,
    limit: 30,
  });
  const ok = await postToSlack(webhook, formatDigest(entries, siteUrl()));
  if (!ok) throw new Error("Slack rejected the message — check the URL");
  return { count: entries.length };
}

export async function setPdfLogoAction(opts: { url: string }) {
  const user = await requireAdmin();
  if (opts.url.trim() !== "") {
    let parsed: URL;
    try {
      parsed = new URL(opts.url);
    } catch {
      throw new Error("Invalid logo URL");
    }
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname.endsWith(".public.blob.vercel-storage.com")
    ) {
      throw new Error("Logo must be an uploaded image");
    }
  }
  await setSetting(db, {
    key: PDF_LOGO_KEY,
    value: opts.url,
    userId: user.id,
  });
  revalidatePath("/admin/settings");
}

export async function setPdfChromeAction(opts: {
  pageId: string;
  pdfChrome: boolean;
}) {
  const user = await requireEditor();
  await db
    .update(pages)
    .set({ pdfChrome: opts.pdfChrome, updatedBy: user.id })
    .where(eq(pages.id, opts.pageId));
  revalidatePath(`/admin/pages/${opts.pageId}`);
}
