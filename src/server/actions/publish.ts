"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/server/auth-guards";
import { publishPage, unpublishPage } from "@/server/pages/publish";

export async function publishAction(opts: { id: string }) {
  const user = await requireAdmin();
  await publishPage(db, { id: opts.id, userId: user.id });
  revalidatePath("/", "layout");
}

export async function unpublishAction(opts: { id: string }) {
  await requireAdmin();
  await unpublishPage(db, { id: opts.id });
  revalidatePath("/", "layout");
}
