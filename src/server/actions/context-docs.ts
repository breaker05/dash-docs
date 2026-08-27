"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/server/auth-guards";
import {
  deleteContextDoc,
  setContextDocAudience,
  setContextDocEnabled,
} from "@/server/context-docs";

export async function deleteContextDocAction(opts: { id: string }) {
  await requireAdmin();
  await deleteContextDoc(db, opts.id);
  revalidatePath("/admin/context");
}

export async function setContextDocEnabledAction(opts: {
  id: string;
  enabled: boolean;
}) {
  const user = await requireAdmin();
  await setContextDocEnabled(db, { ...opts, userId: user.id });
  revalidatePath("/admin/context");
}

export async function setContextDocAudienceAction(opts: {
  id: string;
  audience: "public" | "internal";
}) {
  const user = await requireAdmin();
  await setContextDocAudience(db, { ...opts, userId: user.id });
  revalidatePath("/admin/context");
}
