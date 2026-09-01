"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Home,
  Lightbulb,
  MessagesSquare,
  Paperclip,
  Search,
  Settings,
  Tags,
  Users,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Command } from "@/components/ui/command";
import { PageIcon } from "@/lib/page-icons";

export type PaletteItem = {
  id: string;
  title: string;
  /** breadcrumb-ish subtitle, e.g. the page path */
  subtitle: string;
  href: string;
  icon: string | null;
  isHome?: boolean;
};

type RemoteResult = { id: string; title: string; path: string; snippet: string };

/**
 * ⌘K palette shared by the public site and the admin. Local items filter
 * instantly; queries of 2+ chars also hit /api/search for full-text results.
 */
export function SearchPalette({
  items,
  mode,
}: {
  items: PaletteItem[];
  mode: "public" | "admin";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remote, setRemote] = useState<RemoteResult[]>([]);
  const openRef = useRef(open);

  // Route every open/close through here so closing resets the palette in the
  // same event that closed it — no separate effect syncing off `open`.
  const changeOpen = useCallback((next: boolean) => {
    openRef.current = next;
    setOpen(next);
    if (!next) {
      setQuery("");
      setRemote([]);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        changeOpen(!openRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changeOpen]);

  // debounced full-text search (2+ char queries only); short queries just
  // stop fetching — stale hits are filtered out at render by the q-length guard
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { results: RemoteResult[] };
        setRemote(data.results);
      } catch {
        // network hiccup — local results still work
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (q === "") return items.slice(0, 12);
    return items
      .filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.subtitle.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [items, q]);

  // full-text hits not already shown in the jump list (ignored for short
  // queries, so results from a previous longer query never linger)
  const shownIds = new Set(filtered.map((i) => i.id));
  const remoteExtra =
    q.length >= 2 ? remote.filter((r) => !shownIds.has(r.id)) : [];

  const go = (href: string) => {
    changeOpen(false);
    router.push(href);
  };

  const adminLinks =
    mode === "admin"
      ? [
          { title: "Feature tags", href: "/admin/tags", icon: Tags },
          { title: "Insights", href: "/admin/insights", icon: Lightbulb },
          { title: "AI context", href: "/admin/context", icon: Paperclip },
          { title: "Chats", href: "/admin/chats", icon: MessagesSquare },
          { title: "Team", href: "/admin/users", icon: Users },
          { title: "Settings", href: "/admin/settings", icon: Settings },
        ].filter((l) => q === "" || l.title.toLowerCase().includes(q))
      : [];

  return (
    <CommandDialog
      open={open}
      onOpenChange={changeOpen}
      title="Search"
      description="Jump to a page or search the docs"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={
            mode === "admin" ? "Jump to a page…" : "Search the docs…"
          }
        />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          {filtered.length > 0 && (
            <CommandGroup heading="Pages">
              {filtered.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  onSelect={() => go(item.href)}
                >
                  {item.isHome ? (
                    <Home className="text-muted-foreground" />
                  ) : item.icon ? (
                    <PageIcon
                      name={item.icon}
                      className="size-4 text-muted-foreground"
                    />
                  ) : (
                    <FileText className="text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.subtitle}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {remoteExtra.length > 0 && (
            <CommandGroup heading="Full-text matches">
              {remoteExtra.map((r) => (
                <CommandItem
                  key={r.id}
                  value={`remote-${r.id}`}
                  onSelect={() =>
                    go(mode === "admin" ? `/admin/pages/${r.id}` : `/${r.path}`)
                  }
                >
                  <Search className="text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.snippet}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {adminLinks.length > 0 && (
            <CommandGroup heading="Admin">
              {adminLinks.map((l) => (
                <CommandItem
                  key={l.href}
                  value={l.href}
                  onSelect={() => go(l.href)}
                >
                  <l.icon className="text-muted-foreground" />
                  {l.title}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
