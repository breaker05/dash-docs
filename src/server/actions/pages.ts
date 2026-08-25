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
}) {
  const user = await requireEditor();
  await tree.updateDraft(db, { ...opts, userId: user.id });
  // no revalidate: autosave must not re-render the editor under the user
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
