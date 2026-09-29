"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/server/auth-guards";
import { AssetInUseError, deleteAssets } from "@/server/assets";

export async function deleteAssetsAction(opts: { ids: string[] }) {
  await requireAdmin();
  try {
    const out = await deleteAssets(db, opts.ids);
    revalidatePath("/admin/assets");
    return out;
  } catch (e) {
    // server-action errors are masked in production; surface this one
    if (e instanceof AssetInUseError) return { error: e.message };
    throw e;
  }
}
