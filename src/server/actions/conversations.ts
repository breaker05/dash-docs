"use server";

import { db } from "@/db";
import { requireUser } from "@/server/auth-guards";
import {
  deleteUserConversation,
  getUserConversation,
  listUserConversations,
} from "@/server/conversations";
import type { MessageSource } from "@/db/schema";

export type MyChatSummary = {
  id: string;
  title: string | null;
  lastMessageAt: string;
};

export type MyChatTurn = {
  role: "user" | "assistant";
  content: string;
  sources?: MessageSource[];
};

/** The signed-in user's own conversations, newest first. */
export async function listMyChatsAction(): Promise<MyChatSummary[]> {
  const user = await requireUser();
  const rows = await listUserConversations(db, user.id);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    lastMessageAt: r.lastMessageAt.toISOString(),
  }));
}

/** Full transcript of one of the user's own conversations, or null. */
export async function getMyChatAction(
  conversationId: string,
): Promise<{ id: string; turns: MyChatTurn[] } | null> {
  const user = await requireUser();
  const got = await getUserConversation(db, {
    userId: user.id,
    conversationId,
  });
  if (!got) return null;
  return {
    id: got.conversation.id,
    turns: got.messages.map((m) => ({
      role: m.role,
      content: m.content,
      sources: m.sources ?? undefined,
    })),
  };
}

export async function deleteMyChatAction(conversationId: string): Promise<void> {
  const user = await requireUser();
  await deleteUserConversation(db, { userId: user.id, conversationId });
}
