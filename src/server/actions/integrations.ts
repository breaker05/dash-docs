"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/server/auth-guards";
import {
  createIntegration,
  deleteIntegration,
  getChatIntegration,
  parseToolList,
  updateIntegration,
  type IntegrationKind,
} from "@/server/integrations";
import { checkConnection } from "@/server/sql-query";
import { probeMcpServer } from "@/server/mcp-probe";

// Validation messages are returned rather than thrown: production builds
// redact thrown server-action errors, and these are meant for the admin.
type Outcome = { ok: true } | { ok: false; error: string };

function failure(err: unknown): Outcome {
  return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
}

export async function createIntegrationAction(opts: {
  name: string;
  kind: IntegrationKind;
  description: string;
  secret: string;
  url?: string;
  allowedTools?: string;
}): Promise<Outcome> {
  const user = await requireAdmin();
  try {
    await createIntegration(db, {
      ...opts,
      allowedTools: parseToolList(opts.allowedTools ?? ""),
      userId: user.id,
    });
  } catch (err) {
    return failure(err);
  }
  revalidatePath("/admin/integrations");
  return { ok: true };
}

export async function updateIntegrationAction(opts: {
  id: string;
  description: string;
  url?: string;
  allowedTools?: string;
  secret?: string;
}): Promise<Outcome> {
  await requireAdmin();
  try {
    await updateIntegration(db, opts.id, {
      description: opts.description,
      url: opts.url,
      allowedTools:
        opts.allowedTools !== undefined ? parseToolList(opts.allowedTools) : undefined,
      secret: opts.secret,
    });
  } catch (err) {
    return failure(err);
  }
  revalidatePath("/admin/integrations");
  return { ok: true };
}

export async function setIntegrationEnabledAction(opts: {
  id: string;
  enabled: boolean;
}) {
  await requireAdmin();
  await updateIntegration(db, opts.id, { enabled: opts.enabled });
  revalidatePath("/admin/integrations");
}

export async function deleteIntegrationAction(opts: { id: string }) {
  await requireAdmin();
  await deleteIntegration(db, opts.id);
  revalidatePath("/admin/integrations");
}

export type IntegrationTestResult =
  | {
      ok: true;
      kind: "postgres";
      currentUser: string;
      database: string;
      superuser: boolean;
      writableTables: number;
      readableTables: number;
    }
  | { ok: true; kind: "mcp"; serverName: string; tools: string[] }
  | { ok: false; error: string };

/** Connects with the stored credential and reports what it can do. */
export async function testIntegrationAction(opts: {
  id: string;
}): Promise<IntegrationTestResult> {
  await requireAdmin();
  const integration = await getChatIntegration(db, opts.id);
  if (!integration) return { ok: false, error: "Integration not found" };
  try {
    if (integration.kind === "postgres") {
      const check = await checkConnection(integration.secret);
      return { ok: true, kind: "postgres", ...check };
    }
    const probe = await probeMcpServer(integration.url!, integration.secret);
    return { ok: true, kind: "mcp", ...probe };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}
