"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/server/auth-guards";
import { setUserRole } from "@/server/users";

export async function setUserRoleAction(opts: {
  userId: string;
  role: "editor" | "admin";
}) {
  await requireAdmin();
  await setUserRole(db, opts);
  revalidatePath("/admin/users");
}
