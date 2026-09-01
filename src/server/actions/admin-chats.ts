"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/server/auth-guards";
import { deleteConversation } from "@/server/conversations";

export async function adminDeleteChatAction(conversationId: string): Promise<void> {
  await requireAdmin();
  await deleteConversation(db, conversationId);
  revalidatePath("/admin/chats");
}
