"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireEditor } from "@/server/auth-guards";
import { restoreRevision, saveManualRevision } from "@/server/pages/revisions";

export async function saveVersionAction(opts: { pageId: string }) {
  const user = await requireEditor();
  await saveManualRevision(db, { pageId: opts.pageId, userId: user.id });
  revalidatePath(`/admin/pages/${opts.pageId}/history`);
}

export async function restoreRevisionAction(opts: {
  pageId: string;
  revisionId: string;
}) {
  const user = await requireEditor();
  await restoreRevision(db, {
    pageId: opts.pageId,
    revisionId: opts.revisionId,
    userId: user.id,
  });
  revalidatePath("/admin", "layout");
}
