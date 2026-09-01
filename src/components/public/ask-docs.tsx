"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  CornerDownLeft,
  History,
  Paperclip,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AnswerMarkdown } from "@/components/public/answer-markdown";
import { Button } from "@/components/ui/button";
import {
  deleteMyChatAction,
  getMyChatAction,
  listMyChatsAction,
  type MyChatSummary,
} from "@/server/actions/conversations";
import { cn } from "@/lib/utils";

type Source = {
  n: number;
  title: string;
  path: string;
  kind?: "page" | "file";
};
type Turn = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const SUGGESTIONS = [
  "How do I submit a lead via the API?",
  "What fields does the customer import accept?",
  "How is rate limiting handled?",
];

export function AskDocs({ isSignedIn = false }: { isSignedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [chats, setChats] = useState<MyChatSummary[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function newChat() {
    setTurns([]);
    setConversationId(null);
    setInput("");
    setView("chat");
  }

  async function openHistory() {
    setView("history");
    setChats(null);
    try {
      setChats(await listMyChatsAction());
    } catch {
      setChats([]);
    }
  }

  async function loadChat(id: string) {
    const chat = await getMyChatAction(id);
    if (!chat) return;
    setTurns(chat.turns.map((t) => ({ ...t })));
    setConversationId(chat.id);
    setView("chat");
    requestAnimationFrame(() =>
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
    );
  }

  async function removeChat(id: string) {
    setChats((prev) => prev?.filter((c) => c.id !== id) ?? null);
    if (id === conversationId) newChat();
    try {
      await deleteMyChatAction(id);
    } catch {
      // best effort — reopen history to resync if it mattered
    }
  }

  async function ask(question: string) {
    if (busy || question.trim() === "") return;
    setBusy(true);
    setInput("");
    setTurns((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);
    const scrollDown = () =>
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
    scrollDown();

    const append = (text: string, sources?: Source[]) =>
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          ...last,
          content: last.content + text,
          ...(sources ? { sources } : {}),
        };
        return next;
      });

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, conversationId }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        append(data?.error ?? "Something went wrong — try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) {
          const data = event.replace(/^data: /, "").trim();
          if (data === "" || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as
              | { type: "meta"; conversationId: string }
              | { type: "delta"; text: string }
              | { type: "sources"; sources: Source[] }
              | { type: "error"; message: string };
            if (parsed.type === "meta") setConversationId(parsed.conversationId);
            else if (parsed.type === "delta") append(parsed.text);
            else if (parsed.type === "sources") append("", parsed.sources);
            else append(`\n${parsed.message}`);
          } catch {
            // partial frame — wait for more
          }
          scrollDown();
        }
      }
    } catch {
      append("Connection lost — try again.");
    } finally {
      setBusy(false);
      scrollDown();
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label="Ask AI about the docs"
            className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg transition-transform hover:scale-[1.03]"
          />
        }
      >
        <Sparkles className="size-4" /> Ask AI
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 data-[side=right]:sm:max-w-lg">
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Ask the docs
          </SheetTitle>
          <div className="flex items-center gap-1">
            {isSignedIn && (
              <button
                type="button"
                onClick={() => (view === "history" ? setView("chat") : openHistory())}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  view === "history" && "bg-muted text-foreground",
                )}
              >
                <History className="size-3.5" /> History
              </button>
            )}
            <button
              type="button"
              onClick={newChat}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-3.5" /> New chat
            </button>
          </div>
        </SheetHeader>

        {view === "history" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {chats === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : chats.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No past chats yet. Ask a question and it&rsquo;ll show up here.
              </p>
            ) : (
              <ul className="space-y-1">
                {chats.map((c) => (
                  <li key={c.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void loadChat(c.id)}
                      className="min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <span className="block truncate">
                        {c.title || "Untitled chat"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {new Date(c.lastMessageAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete chat"
                      onClick={() => void removeChat(c.id)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {turns.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Answers come straight from the documentation, with sources
                  cited — ask anything about the Dash Marketing platform or API.
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground/80">
                  Conversations are saved to help improve the docs and are
                  automatically deleted after 60 days
                  {isSignedIn
                    ? " — yours are under History above."
                    : "."}
                </p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void ask(s)}
                      className="block w-full rounded-lg border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, i) => (
              <div
                key={i}
                className={cn(
                  "text-sm leading-relaxed",
                  turn.role === "user" &&
                    "ml-8 rounded-xl rounded-br-sm bg-primary/10 px-3.5 py-2.5",
                )}
              >
                {turn.role === "assistant" ? (
                  turn.content ? (
                    <AnswerMarkdown text={turn.content} />
                  ) : busy && i === turns.length - 1 ? (
                    "…"
                  ) : null
                ) : (
                  turn.content
                )}
                {turn.sources && turn.sources.length > 0 && (
                  <span className="mt-2.5 flex flex-wrap gap-1.5">
                    {turn.sources.map((s) =>
                      s.kind === "file" ? (
                        <span
                          key={s.n}
                          className="flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                          title="Reference file"
                        >
                          <Paperclip className="size-3" /> [{s.n}] {s.title}
                        </span>
                      ) : (
                        <Link
                          key={s.n}
                          href={`/${s.path}`}
                          onClick={() => setOpen(false)}
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
        )}

        {view === "chat" && (
          <form
            className="flex items-center gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              className="h-9.5 min-w-0 flex-1 rounded-lg border bg-muted/50 px-3 text-sm focus:border-ring focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <Button type="submit" size="sm" disabled={busy || input.trim() === ""}>
              <CornerDownLeft className="size-4" />
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
