import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { db } from "@/db";
import { requireUser } from "@/server/auth-guards";
import { getConversation } from "@/server/conversations";
import { AnswerMarkdown } from "@/components/public/answer-markdown";
import { DeleteChatButton } from "@/components/admin/delete-chat-button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Chat — Dash Docs" };

export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/admin");

  const { id } = await params;
  const chat = await getConversation(db, id);
  if (!chat) notFound();

  const { conversation, userEmail, messages } = chat;

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <Link
        href="/admin/chats"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All chats
      </Link>

      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            {conversation.title || "Untitled chat"}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{userEmail ?? "Anonymous visitor"}</span>
            <span>·</span>
            <span>
              {new Date(conversation.createdAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
            <span>·</span>
            <span>
              {conversation.model} · effort {conversation.effort}
            </span>
            {conversation.includeInternal && (
              <>
                <span>·</span>
                <span>internal pages in scope</span>
              </>
            )}
          </p>
        </div>
        <DeleteChatButton
          conversationId={conversation.id}
          redirectTo="/admin/chats"
          variant="button"
        />
      </div>

      <div className="space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "text-sm leading-relaxed",
              m.role === "user"
                ? "ml-10 rounded-xl rounded-br-sm bg-primary/10 px-3.5 py-2.5"
                : "rounded-xl border px-3.5 py-2.5",
            )}
          >
            {m.role === "assistant" ? (
              <AnswerMarkdown text={m.content} />
            ) : (
              m.content
            )}
            {m.sources && m.sources.length > 0 && (
              <span className="mt-2.5 flex flex-wrap gap-1.5">
                {m.sources.map((s) =>
                  s.kind === "file" ? (
                    <span
                      key={s.n}
                      className="flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      <Paperclip className="size-3" /> [{s.n}] {s.title}
                    </span>
                  ) : (
                    <Link
                      key={s.n}
                      href={`/${s.path}`}
                      className="rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
                    >
                      [{s.n}] {s.title}
                    </Link>
                  ),
                )}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
