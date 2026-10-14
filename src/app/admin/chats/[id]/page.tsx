import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Database, Paperclip } from "lucide-react";
import { db } from "@/db";
import { requireUser } from "@/server/auth-guards";
import { getConversation } from "@/server/conversations";
import { AnswerMarkdown } from "@/components/public/answer-markdown";
import { DeleteChatButton } from "@/components/admin/delete-chat-button";
import { formatTokens, formatUsd } from "@/lib/format-usage";
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
  const totalTokens = messages.reduce(
    (n, m) =>
      n +
      (m.inputTokens ?? 0) +
      (m.outputTokens ?? 0) +
      (m.cacheReadTokens ?? 0) +
      (m.cacheWriteTokens ?? 0),
    0,
  );
  const totalCost = messages.reduce((n, m) => n + (m.costUsd ?? 0), 0);

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
            {totalTokens > 0 && (
              <>
                <span>·</span>
                <span>{formatTokens(totalTokens)} tokens</span>
                <span>·</span>
                <span className="font-medium text-foreground">
                  {formatUsd(totalCost)}
                </span>
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
            {m.toolCalls && m.toolCalls.length > 0 && (
              <details className="mb-2.5 rounded-lg border bg-muted/30 text-xs">
                <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground">
                  <Database className="size-3.5" /> {m.toolCalls.length} live-data{" "}
                  {m.toolCalls.length === 1 ? "lookup" : "lookups"}
                </summary>
                <ul className="divide-y border-t">
                  {m.toolCalls.map((c, i) => (
                    <li key={i} className="space-y-1 px-2.5 py-2">
                      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                        <span className="font-mono font-medium text-foreground">
                          {c.integration} · {c.tool}
                        </span>
                        <span className={c.ok ? "" : "text-destructive"}>
                          {c.summary}
                        </span>
                        {c.ms != null && <span>{c.ms} ms</span>}
                      </p>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-background px-2 py-1.5 font-mono text-[0.7rem]">
                        {c.input &&
                        typeof c.input === "object" &&
                        "sql" in c.input
                          ? String((c.input as { sql: unknown }).sql)
                          : JSON.stringify(c.input, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ul>
              </details>
            )}
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
            {m.role === "assistant" && m.costUsd != null && (
              <span className="mt-2 block text-[0.7rem] text-muted-foreground/70">
                {formatTokens(
                  (m.inputTokens ?? 0) +
                    (m.outputTokens ?? 0) +
                    (m.cacheReadTokens ?? 0) +
                    (m.cacheWriteTokens ?? 0),
                )}{" "}
                tokens · {formatUsd(m.costUsd)}
                {(m.cacheReadTokens ?? 0) > 0 &&
                  ` · ${formatTokens(m.cacheReadTokens ?? 0)} cached`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
