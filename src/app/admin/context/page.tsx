import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth-guards";
import { listContextDocs } from "@/server/context-docs";
import { ContextDocs } from "@/components/admin/context-docs";

export const metadata = { title: "AI context — Dash Docs" };

export default async function ContextPage() {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/admin");

  const docs = await listContextDocs(db);

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        AI context files
      </h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-muted-foreground">
        Reference files that feed the “Ask AI” chat and authorized MCP
        clients — API specs, schemas, notes — without ever appearing as docs
        pages, in navigation, or in search. Files are split into searchable
        chunks; “Team answers only” files never inform answers for anonymous
        visitors.
      </p>
      <ContextDocs
        docs={docs.map((d) => ({
          id: d.id,
          name: d.name,
          filename: d.filename,
          bytes: d.bytes,
          audience: d.audience,
          enabled: d.enabled,
          chunkCount: d.chunkCount,
          updatedAt: d.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
