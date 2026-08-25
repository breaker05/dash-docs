import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";

export const ALLOWED_DOMAIN =
  process.env.AUTH_ALLOWED_DOMAIN ?? "dashmarketing.io";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  providers: [
    Google({
      // `hd` here only pre-filters the account chooser UI; the real
      // enforcement is the signIn callback below, which checks the verified
      // ID-token profile.
      authorization: {
        params: { hd: ALLOWED_DOMAIN, prompt: "select_account" },
      },
    }),
  ],
  pages: { signIn: "/signin" },
  callbacks: {
    signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      return (
        profile?.hd === ALLOWED_DOMAIN && profile?.email_verified === true
      );
    },
    session({ session, user }) {
      session.user.id = user.id;
      session.user.role = user.role;
      return session;
    },
  },
});
