import { and, eq, gt, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { editPresence } from "@/db/schema";

/** Presence rows older than this are considered gone. */
export const PRESENCE_TTL_SECONDS = 60;

export async function heartbeat(
  db: Db,
  opts: { pageId: string; userId: string; userName: string },
): Promise<void> {
  await db
    .insert(editPresence)
    .values({
      pageId: opts.pageId,
      userId: opts.userId,
      userName: opts.userName,
    })
    .onConflictDoUpdate({
      target: [editPresence.pageId, editPresence.userId],
      set: { userName: opts.userName, seenAt: sql`now()` },
    });
}

/** Other people actively editing this page right now. */
export async function activeEditors(
  db: Db,
  opts: { pageId: string; excludeUserId: string; now?: Date },
): Promise<{ userId: string; userName: string }[]> {
  const cutoff = new Date(
    (opts.now ?? new Date()).getTime() - PRESENCE_TTL_SECONDS * 1000,
  );
  return db
    .select({ userId: editPresence.userId, userName: editPresence.userName })
    .from(editPresence)
    .where(
      and(
        eq(editPresence.pageId, opts.pageId),
        ne(editPresence.userId, opts.excludeUserId),
        gt(editPresence.seenAt, cutoff),
      ),
    );
}
