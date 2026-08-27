"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/server/auth-guards";
import { createApiKey, revokeApiKey } from "@/server/api-keys";

export async function createApiKeyAction(opts: {
  name: string;
}): Promise<{ token: string }> {
  const user = await requireAdmin();
  const { token } = await createApiKey(db, {
    name: opts.name,
    userId: user.id,
  });
  revalidatePath("/admin/settings");
  return { token };
}

export async function revokeApiKeyAction(opts: { id: string }): Promise<void> {
  await requireAdmin();
  await revokeApiKey(db, opts.id);
  revalidatePath("/admin/settings");
}
