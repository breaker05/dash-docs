import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, User2 } from "lucide-react";
import { db } from "@/db";
import { requireUser } from "@/server/auth-guards";
import { listAllConversations } from "@/server/conversations";
import { DeleteChatButton } from "@/components/admin/delete-chat-button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Chats — Dash Docs" };

const TABS = [
  { key: "all", label: "All" },
  { key: "user", label: "Team" },
  { key: "anon", label: "Anonymous" },
] as const;

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; q?: string }>;
}) {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/admin");

  const { a, q } = await searchParams;
  const audience = a === "user" || a === "anon" ? a : "all";
  const query = q?.trim() ?? "";
  const rows = await listAllConversations(db, { audience, q: query });

  const tabHref = (key: string) => {
    const params = new URLSearchParams();
    if (key !== "all") params.set("a", key);
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `/admin/chats?${qs}` : "/admin/chats";
  };

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Chats</h1>
      <p className="mb-5 text-[0.95rem] leading-relaxed text-muted-foreground">
        Every “Ask AI” conversation, newest first. Anonymous visitors&rsquo;
        chats are logged here for review; signed-in team members&rsquo; chats
        show their name. Conversations are deleted 60 days after their last
        message.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                audience === t.key
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form action="/admin/chats" className="relative ml-auto">
          {audience !== "all" && <input type="hidden" name="a" value={audience} />}
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search titles…"
            className="h-8 w-56 rounded-lg border bg-muted/50 pl-8 pr-3 text-sm focus:border-ring focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No conversations{query ? " match that search" : " yet"}.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/admin/chats/${c.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {c.title || "Untitled chat"}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {c.userEmail ? (
                    <span className="flex items-center gap-1">
                      <User2 className="size-3" /> {c.userEmail}
                    </span>
                  ) : (
                    <span>Anonymous</span>
                  )}
                  <span>·</span>
                  <span>{c.messageCount} messages</span>
                  <span>·</span>
                  <span>
                    {new Date(c.lastMessageAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
              </Link>
              <DeleteChatButton conversationId={c.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
