"use client";

import { useMemo, useState, useTransition } from "react";
import { Ban, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { setPageIconAction } from "@/server/actions/pages";
import { PAGE_ICONS, PageIcon } from "@/lib/page-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function IconPicker({
  pageId,
  icon,
}: {
  pageId: string;
  icon: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(icon);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const names = useMemo(() => {
    const all = Object.keys(PAGE_ICONS);
    const q = query.trim().toLowerCase();
    return q ? all.filter((n) => n.includes(q)) : all;
  }, [query]);

  function choose(next: string | null) {
    const previous = current;
    setCurrent(next);
    setOpen(false);
    startTransition(async () => {
      try {
        await setPageIconAction({ id: pageId, icon: next });
      } catch (e) {
        setCurrent(previous);
        toast.error(e instanceof Error ? e.message : "Icon update failed");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-between"
            disabled={pending}
          />
        }
      >
        <span className="flex items-center gap-2">
          {current ? (
            <>
              <PageIcon name={current} className="size-4" />
              <span className="font-mono text-xs">{current}</span>
            </>
          ) : (
            <span className="text-muted-foreground">No icon</span>
          )}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          className="mb-2.5 h-8"
          autoFocus
        />
        <div className="grid max-h-56 grid-cols-8 gap-1 overflow-y-auto">
          <button
            type="button"
            title="No icon"
            onClick={() => choose(null)}
            className={cn(
              "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              current === null && "bg-accent",
            )}
          >
            <Ban className="size-4" />
          </button>
          {names.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => choose(name)}
              className={cn(
                "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground",
                current === name && "bg-accent text-accent-foreground",
              )}
            >
              <PageIcon name={name} className="size-4" />
            </button>
          ))}
          {names.length === 0 && (
            <p className="col-span-8 py-4 text-center text-xs text-muted-foreground">
              No icons match “{query}”
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
