import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth-guards";
import { listIntegrations } from "@/server/integrations";
import { Integrations } from "@/components/admin/integrations";

export const metadata = { title: "Integrations — Dash Docs" };

export default async function IntegrationsPage() {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/admin");

  const items = await listIntegrations(db);

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Integrations
      </h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-muted-foreground">
        Live data sources the “Ask AI” chat can look things up in — a
        read-only Postgres database (e.g. the Dash platform) or a remote MCP
        server. <strong className="text-foreground">Signed-in team members
        only</strong>: anonymous visitors never get these tools. Every lookup
        is logged on the chat in{" "}
        <Link href="/admin/chats" className="text-primary hover:underline">
          Chats
        </Link>
        .
      </p>
      <Integrations
        items={items.map((i) => ({
          id: i.id,
          name: i.name,
          kind: i.kind,
          description: i.description,
          url: i.url,
          allowedTools: i.allowedTools,
          enabled: i.enabled,
          secretHint: i.secretHint,
          lastUsedAt: i.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
