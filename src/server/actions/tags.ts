"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin, requireEditor } from "@/server/auth-guards";
import {
  createTag,
  deleteTag,
  renameTag,
  setPageTags,
} from "@/server/tags";

export async function createTagAction(opts: { name: string }) {
  await requireEditor();
  const tag = await createTag(db, opts.name);
  revalidatePath("/admin", "layout");
  return { id: tag.id, name: tag.name, slug: tag.slug };
}

export async function renameTagAction(opts: { id: string; name: string }) {
  await requireAdmin();
  await renameTag(db, opts);
  revalidatePath("/admin", "layout");
}

export async function deleteTagAction(opts: { id: string }) {
  await requireAdmin();
  await deleteTag(db, opts.id);
  revalidatePath("/admin", "layout");
}

export async function setPageTagsAction(opts: {
  pageId: string;
  tagIds: string[];
}) {
  await requireEditor();
  await setPageTags(db, opts);
  revalidatePath(`/admin/pages/${opts.pageId}`);
}
