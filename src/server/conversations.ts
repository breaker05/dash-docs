import { and, asc, desc, eq, ilike, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import {
  conversations,
  messages,
  users,
  type Conversation,
  type Message,
  type MessageSource,
} from "@/db/schema";

const TITLE_MAX = 80;

export type Turn = { role: "user" | "assistant"; content: string };

/**
 * Persistence + retrieval for Ask AI chats. Every conversation (anonymous or
 * signed-in) is stored for admin review; signed-in members can revisit their
 * own. Own-only authorization is enforced here, not at the call site.
 */

export async function createConversation(
  db: Db,
  input: {
    userId: string | null;
    model: string;
    effort: string;
    includeInternal: boolean;
    firstQuestion: string;
  },
): Promise<string> {
  const title = input.firstQuestion.trim().slice(0, TITLE_MAX) || null;
  const [row] = await db
    .insert(conversations)
    .values({
      userId: input.userId,
      model: input.model,
      effort: input.effort,
      includeInternal: input.includeInternal,
      title,
    })
    .returning({ id: conversations.id });
  return row.id;
}

export async function addMessage(
  db: Db,
  opts: {
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    sources?: MessageSource[];
    /** token usage + dollar cost for assistant turns */
    usage?: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    };
    costUsd?: number;
  },
): Promise<void> {
  await db.insert(messages).values({
    conversationId: opts.conversationId,
    role: opts.role,
    content: opts.content,
    sources: opts.sources ?? null,
    inputTokens: opts.usage?.input ?? null,
    outputTokens: opts.usage?.output ?? null,
    cacheReadTokens: opts.usage?.cacheRead ?? null,
    cacheWriteTokens: opts.usage?.cacheWrite ?? null,
    costUsd: opts.costUsd ?? null,
  });
  await db
    .update(conversations)
    .set({ lastMessageAt: sql`now()` })
    .where(eq(conversations.id, opts.conversationId));
}

/** Prior turns of a conversation, chronological, shaped for the model. */
export async function loadConversationHistory(
  db: Db,
  conversationId: string,
): Promise<Turn[]> {
  const rows = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.seq));
  return rows;
}

/**
 * Resolve a conversation the caller may append to: the owning member, or
 * anyone holding the id of an anonymous conversation. Returns null when the
 * conversation is unknown or owned by a different member.
 */
export async function conversationForRequest(
  db: Db,
  opts: { conversationId: string; userId: string | null },
): Promise<Conversation | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, opts.conversationId));
  if (!row) return null;
  if (row.userId !== null && row.userId !== opts.userId) return null;
  return row;
}

// --- user-facing history (signed-in, own-only) ----------------------------

export async function listUserConversations(
  db: Db,
  userId: string,
): Promise<Pick<Conversation, "id" | "title" | "lastMessageAt">[]> {
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(50);
}

export async function getUserConversation(
  db: Db,
  opts: { userId: string; conversationId: string },
): Promise<{ conversation: Conversation; messages: Message[] } | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, opts.conversationId),
        eq(conversations.userId, opts.userId),
      ),
    );
  if (!conversation) return null;
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, opts.conversationId))
    .orderBy(asc(messages.seq));
  return { conversation, messages: msgs };
}

export async function deleteUserConversation(
  db: Db,
  opts: { userId: string; conversationId: string },
): Promise<boolean> {
  const deleted = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.id, opts.conversationId),
        eq(conversations.userId, opts.userId),
      ),
    )
    .returning({ id: conversations.id });
  return deleted.length > 0;
}

// --- admin review ----------------------------------------------------------

export type ConversationListItem = {
  id: string;
  title: string | null;
  userId: string | null;
  userEmail: string | null;
  messageCount: number;
  totalTokens: number;
  totalCostUsd: number;
  createdAt: Date;
  lastMessageAt: Date;
};

// summed token count of a conversation's messages, as a SQL fragment
const tokenSumSql = sql<number>`coalesce((select sum(
  coalesce(${messages.inputTokens}, 0) + coalesce(${messages.outputTokens}, 0)
  + coalesce(${messages.cacheReadTokens}, 0) + coalesce(${messages.cacheWriteTokens}, 0)
)::int from ${messages} where ${messages.conversationId} = ${conversations.id}), 0)`;

const costSumSql = sql<number>`coalesce((select sum(${messages.costUsd})::float8
  from ${messages} where ${messages.conversationId} = ${conversations.id}), 0)`;

export async function listAllConversations(
  db: Db,
  filter: {
    audience?: "all" | "user" | "anon";
    q?: string;
    limit?: number;
    offset?: number;
  },
): Promise<ConversationListItem[]> {
  const conds = [];
  if (filter.audience === "user") conds.push(isNotNull(conversations.userId));
  if (filter.audience === "anon") conds.push(isNull(conversations.userId));
  if (filter.q && filter.q.trim() !== "") {
    conds.push(ilike(conversations.title, `%${filter.q.trim()}%`));
  }
  return db
    .select({
      id: conversations.id,
      title: conversations.title,
      userId: conversations.userId,
      userEmail: users.email,
      messageCount: sql<number>`(select count(*)::int from ${messages} where ${messages.conversationId} = ${conversations.id})`,
      totalTokens: tokenSumSql,
      totalCostUsd: costSumSql,
      createdAt: conversations.createdAt,
      lastMessageAt: conversations.lastMessageAt,
    })
    .from(conversations)
    .leftJoin(users, eq(conversations.userId, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(filter.limit ?? 100)
    .offset(filter.offset ?? 0);
}

export async function getConversation(
  db: Db,
  conversationId: string,
): Promise<{
  conversation: Conversation;
  userEmail: string | null;
  messages: Message[];
} | null> {
  const [row] = await db
    .select({ conversation: conversations, userEmail: users.email })
    .from(conversations)
    .leftJoin(users, eq(conversations.userId, users.id))
    .where(eq(conversations.id, conversationId));
  if (!row) return null;
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.seq));
  return { conversation: row.conversation, userEmail: row.userEmail, messages: msgs };
}

export async function deleteConversation(
  db: Db,
  conversationId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(conversations)
    .where(eq(conversations.id, conversationId))
    .returning({ id: conversations.id });
  return deleted.length > 0;
}

/**
 * Retention: delete conversations with no activity for `olderThanDays` (by
 * lastMessageAt); their messages cascade. Returns the number removed. Run on a
 * schedule — see /api/purge-chats.
 */
export async function purgeOldConversations(
  db: Db,
  opts: { olderThanDays: number; now?: Date },
): Promise<number> {
  const cutoff = new Date(
    (opts.now ?? new Date()).getTime() -
      opts.olderThanDays * 24 * 60 * 60 * 1000,
  );
  const deleted = await db
    .delete(conversations)
    .where(lt(conversations.lastMessageAt, cutoff))
    .returning({ id: conversations.id });
  return deleted.length;
}
