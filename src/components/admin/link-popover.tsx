"use client";

import { useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ExternalLink, FileText, Home, Link as LinkIcon, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type LinkTarget = {
  id: string;
  title: string;
  path: string;
  isHome: boolean;
  published: boolean;
};

function looksLikeUrl(value: string): boolean {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(value.trim());
}

export function LinkPopover({
  editor,
  targets,
  currentPageId,
}: {
  editor: Editor;
  targets: LinkTarget[];
  currentPageId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const active = editor.isActive("link");
  const currentHref: string = editor.getAttributes("link").href ?? "";

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const candidates = targets.filter((t) => t.id !== currentPageId);
    if (q === "" || looksLikeUrl(query)) return candidates.slice(0, 8);
    return candidates
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) || t.path.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [targets, query, currentPageId]);

  function applyLink(href: string, fallbackText: string) {
    const { empty } = editor.state.selection;
    if (empty && !active) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "text",
          text: fallbackText,
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Link"
            aria-label="Link"
            // keep the editor's text selection when clicking the trigger
            onMouseDown={(e) => e.preventDefault()}
            className={cn("size-8 p-0", active && "bg-accent")}
          />
        }
      >
        <LinkIcon className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (looksLikeUrl(query)) {
                applyLink(query.trim(), query.trim());
              } else if (results[0]) {
                const t = results[0];
                applyLink(t.isHome ? "/" : `/${t.path}`, t.title);
              }
            }
          }}
          placeholder="Search pages, or paste a URL…"
          className="h-8 text-sm"
        />

        {looksLikeUrl(query) && (
          <button
            type="button"
            onClick={() => applyLink(query.trim(), query.trim())}
            className="mt-1.5 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              Link to <span className="font-mono text-xs">{query.trim()}</span>
            </span>
          </button>
        )}

        <div className="mt-1.5 max-h-64 overflow-y-auto">
          {results.length > 0 ? (
            <>
              <p className="px-2 pb-1 pt-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Pages
              </p>
              {results.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    applyLink(t.isHome ? "/" : `/${t.path}`, t.title)
                  }
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  {t.isHome ? (
                    <Home className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{t.title}</span>
                    <span className="block truncate font-mono text-[0.7rem] text-muted-foreground">
                      {t.isHome ? "/" : `/${t.path}`}
                    </span>
                  </span>
                  {!t.published && (
                    <span className="shrink-0 rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground">
                      draft
                    </span>
                  )}
                </button>
              ))}
            </>
          ) : (
            !looksLikeUrl(query) && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No pages match — paste a URL to link externally.
              </p>
            )
          )}
        </div>

        {active && (
          <div className="mt-1.5 border-t pt-1.5">
            <p className="truncate px-2 pb-1 font-mono text-[0.7rem] text-muted-foreground">
              {currentHref}
            </p>
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-destructive hover:bg-accent"
            >
              <Unlink className="size-3.5 shrink-0" /> Remove link
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
