import { redirect } from "next/navigation";
import { auth } from "@/auth";

export type SessionUser = {
  id: string;
  role: "editor" | "admin";
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

/** Any signed-in @dashmarketing.io user. Redirects to sign-in when absent. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  return session.user as SessionUser;
}

/** Editors and admins may create/edit drafts. */
export async function requireEditor(): Promise<SessionUser> {
  return requireUser();
}

/** Admins only: publish/unpublish/delete, user + tag management. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("Forbidden: admin role required");
  }
  return user;
}

/** Session or null, without redirecting (for public pages that adapt). */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  return (session?.user as SessionUser | undefined) ?? null;
}
