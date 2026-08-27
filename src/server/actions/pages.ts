"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireAdmin, requireEditor } from "@/server/auth-guards";
import * as tree from "@/server/pages/tree";

function refreshAdmin() {
  revalidatePath("/admin", "layout");
}

export async function createPageAction(opts: {
  title: string;
  parentId?: string | null;
}) {
  const user = await requireEditor();
  const page = await tree.createPage(db, {
    title: opts.title,
    parentId: opts.parentId ?? null,
    userId: user.id,
  });
  refreshAdmin();
  redirect(`/admin/pages/${page.id}`);
}

export async function updateDraftAction(opts: {
  id: string;
  title?: string;
  contentMd?: string;
  /** ISO timestamp the client loaded/last saved — rejects overwrites of newer saves */
  baseDraftUpdatedAt?: string;
}): Promise<{ draftUpdatedAt: string } | { conflict: true }> {
  const user = await requireEditor();
  try {
    const { draftUpdatedAt } = await tree.updateDraft(db, {
      id: opts.id,
      title: opts.title,
      contentMd: opts.contentMd,
      userId: user.id,
      baseDraftUpdatedAt: opts.baseDraftUpdatedAt
        ? new Date(opts.baseDraftUpdatedAt)
        : undefined,
    });
    // no revalidate: autosave must not re-render the editor under the user
    return { draftUpdatedAt: draftUpdatedAt.toISOString() };
  } catch (e) {
    // returned (not thrown): server-action error messages are masked in
    // production, and the client must reliably distinguish a conflict
    if (e instanceof Error && e.message === tree.DRAFT_CONFLICT) {
      return { conflict: true };
    }
    throw e;
  }
}

export async function editPresenceAction(opts: {
  pageId: string;
}): Promise<{ editors: { userName: string }[] }> {
  const user = await requireEditor();
  const { heartbeat, activeEditors } = await import("@/server/presence");
  await heartbeat(db, {
    pageId: opts.pageId,
    userId: user.id,
    userName: user.name ?? user.email ?? "Someone",
  });
  const editors = await activeEditors(db, {
    pageId: opts.pageId,
    excludeUserId: user.id,
  });
  return { editors: editors.map((e) => ({ userName: e.userName })) };
}

export async function movePageAction(opts: {
  id: string;
  newParentId: string | null;
  newIndex: number;
}) {
  const user = await requireEditor();
  await tree.movePage(db, { ...opts, userId: user.id });
  refreshAdmin();
}

export async function renamePageAction(opts: { id: string; slug: string }) {
  const user = await requireEditor();
  await tree.renamePage(db, { ...opts, userId: user.id });
  refreshAdmin();
}

export async function setVisibilityAction(opts: {
  id: string;
  visibility: "public" | "internal";
}) {
  const user = await requireEditor();
  await tree.setVisibility(db, { ...opts, userId: user.id });
  refreshAdmin();
}

export async function setPageIconAction(opts: {
  id: string;
  icon: string | null;
}) {
  const user = await requireEditor();
  await tree.setPageIcon(db, { ...opts, userId: user.id });
  refreshAdmin();
}

export async function deletePageAction(opts: { id: string }) {
  await requireAdmin();
  await tree.deletePage(db, opts.id);
  refreshAdmin();
  redirect("/admin");
}

export async function setHomePageAction(opts: { id: string }) {
  await requireAdmin();
  await tree.setHomePage(db, opts.id);
  refreshAdmin();
}
