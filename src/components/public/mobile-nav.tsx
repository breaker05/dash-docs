"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { PublicNav } from "@/components/public/nav";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NavNode } from "@/server/pages/nav";

export function MobileNav({ nodes }: { nodes: NavNode[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // close the drawer when a nav link navigates
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a route change, not local state
    setOpen(false);
  }, [pathname]);

  if (nodes.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Open navigation"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
      >
        <Menu className="size-4.5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-80 gap-0 p-0">
        <SheetHeader className="gap-2.5 border-b px-4 py-3">
          <SheetTitle className="text-sm font-semibold">
            Documentation
          </SheetTitle>
          <form action="/search">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                name="q"
                placeholder="Search the docs…"
                className="h-8.5 w-full rounded-lg border bg-muted/50 pl-8.5 pr-3 text-sm focus:border-ring focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </form>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-3">
          <PublicNav nodes={nodes} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
