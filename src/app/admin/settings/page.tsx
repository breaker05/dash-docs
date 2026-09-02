import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth-guards";
import {
  ANTHROPIC_KEY_SETTING,
  ASK_CORPUS_BUDGET_KEY,
  ASK_DISABLED_KEY,
  ASK_EFFORT_KEY,
  ASK_MODEL_KEY,
  GA_ID_KEY,
  getSettings,
  PDF_FOOTER_KEY,
  PDF_HEADER_KEY,
  PDF_LOGO_KEY,
  SLACK_WEBHOOK_KEY,
} from "@/server/settings";
import {
  DEFAULT_CORPUS_TOKEN_BUDGET,
  isCorpusBudget,
  resolveAskEffort,
  resolveAskModel,
} from "@/lib/ask-models";
import { AiSettingsForm } from "@/components/admin/ai-settings-form";
import { SlackSettingsForm } from "@/components/admin/slack-settings-form";
import { listApiKeys } from "@/server/api-keys";
import { PdfSettingsForm } from "@/components/admin/pdf-settings-form";
import { AnalyticsSettingsForm } from "@/components/admin/analytics-settings-form";
import { McpKeys } from "@/components/admin/mcp-keys";
import { Separator } from "@/components/ui/separator";

export default async function SettingsPage() {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/admin");

  const apiKeys = await listApiKeys(db);
  const values = await getSettings(db, [
    PDF_HEADER_KEY,
    PDF_FOOTER_KEY,
    PDF_LOGO_KEY,
    GA_ID_KEY,
    SLACK_WEBHOOK_KEY,
    ANTHROPIC_KEY_SETTING,
    ASK_DISABLED_KEY,
    ASK_MODEL_KEY,
    ASK_EFFORT_KEY,
    ASK_CORPUS_BUDGET_KEY,
  ]);
  const aiSource = process.env.ANTHROPIC_API_KEY
    ? ("env" as const)
    : values[ANTHROPIC_KEY_SETTING]
      ? ("settings" as const)
      : null;

  return (
    <div className="mx-auto max-w-2xl px-8 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-muted-foreground">
        Site-wide configuration. Admins only.
      </p>

      <h2 className="mb-1 text-lg font-semibold tracking-tight">
        PDF exports
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Applied to PDF exports of pages that have “Default PDF header/footer”
        enabled (all pages by default — toggle per page in the editor).
        Use <code className="rounded bg-muted px-1 py-0.5 text-xs">|</code> to
        separate left/right sections and these tokens:{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          {"{title} {page} {pages} {date} {url}"}
        </code>
        . Leave a field empty to disable it.
      </p>
      <PdfSettingsForm
        headerText={values[PDF_HEADER_KEY] ?? ""}
        footerText={values[PDF_FOOTER_KEY] ?? ""}
        logoUrl={values[PDF_LOGO_KEY] ?? ""}
      />

      <Separator className="my-8" />

      <h2 className="mb-1 text-lg font-semibold tracking-tight">Analytics</h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Traffic measurement for the public docs site. The tag is only rendered
        on public pages — the admin area is never tracked.
      </p>
      <AnalyticsSettingsForm gaId={values[GA_ID_KEY] ?? ""} />

      <Separator className="my-8" />

      <h2 className="mb-1 text-lg font-semibold tracking-tight">Ask AI</h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        The “Ask AI” chat on the public site answers questions from your
        published docs with cited sources (visitors see public pages only;
        signed-in team members also get internal pages). It needs an
        Anthropic API key and hides itself until one is set.
      </p>
      <AiSettingsForm
        configured={aiSource !== null}
        source={aiSource}
        enabled={aiSource !== null && !values[ASK_DISABLED_KEY]}
        model={resolveAskModel(values[ASK_MODEL_KEY]).id}
        effort={resolveAskEffort(values[ASK_EFFORT_KEY])}
        corpusBudget={
          isCorpusBudget(values[ASK_CORPUS_BUDGET_KEY] ?? "")
            ? values[ASK_CORPUS_BUDGET_KEY]
            : String(DEFAULT_CORPUS_TOKEN_BUDGET)
        }
      />

      <Separator className="my-8" />

      <h2 className="mb-1 text-lg font-semibold tracking-tight">
        Slack digest
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        A weekly summary of published docs changes, posted to a Slack channel
        via an incoming webhook. Includes internal pages (it goes to your
        team). The public <code className="rounded bg-muted px-1 py-0.5 text-xs">/changelog</code>{" "}
        page shows the same history to visitors, public pages only.
      </p>
      <SlackSettingsForm webhookUrl={values[SLACK_WEBHOOK_KEY] ?? ""} />

      <Separator className="my-8" />

      <h2 className="mb-1 text-lg font-semibold tracking-tight">
        MCP API keys
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Keys let AI tools and internal systems (chatbots, Claude Code, skills)
        read <strong>internal</strong> published pages through the MCP server
        at <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/mcp</code>.
        Without a key, MCP only ever serves public pages. Send the key as an{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          Authorization: Bearer
        </code>{" "}
        header.
      </p>
      <McpKeys
        keys={apiKeys.map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
