import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { users, type User } from "@/db/schema";

export async function listUsers(db: Db): Promise<User[]> {
  return db.select().from(users).orderBy(users.createdAt);
}

export async function setUserRole(
  db: Db,
  opts: { userId: string; role: "editor" | "admin" },
): Promise<void> {
  await db.transaction(async (tx) => {
    if (opts.role === "editor") {
      const otherAdmins = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "admin"), ne(users.id, opts.userId)));
      if (otherAdmins.length === 0) {
        throw new Error("Cannot demote the last admin");
      }
    }
    await tx
      .update(users)
      .set({ role: opts.role })
      .where(eq(users.id, opts.userId));
  });
}
