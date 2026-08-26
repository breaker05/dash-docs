"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Lock } from "lucide-react";
import { PageIcon } from "@/lib/page-icons";
import { cn } from "@/lib/utils";
import type { NavNode } from "@/server/pages/nav";

type NavCtx = {
  collapsed: Set<string>;
  toggle: (id: string) => void;
};

function CollapseChevron({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
      aria-expanded={open}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-border/60 hover:text-foreground"
    >
      <ChevronRight
        className={cn(
          "size-3.5 transition-transform duration-150",
          open && "rotate-90",
        )}
      />
    </button>
  );
}

function NavItems({
  nodes,
  depth,
  ctx,
}: {
  nodes: NavNode[];
  depth: number;
  ctx: NavCtx;
}) {
  const pathname = usePathname();
  if (nodes.length === 0) return null;
  return (
    <ul
      className={cn(
        "space-y-px",
        depth > 0 && "ml-3.5 border-l border-border/70 pl-2",
      )}
    >
      {nodes.map((node) => {
        const href = node.isHome ? "/" : `/${node.path}`;
        const active = pathname === href;
        const hasChildren = node.children.length > 0;
        const open = !ctx.collapsed.has(node.id);
        return (
          <li key={node.id}>
            {node.published ? (
              <Link
                href={href}
                className={cn(
                  "group/nav flex items-center gap-1.5 rounded-md py-1.5 pl-1 pr-2.5 text-[0.9rem] transition-colors",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {hasChildren ? (
                  <CollapseChevron
                    open={open}
                    onToggle={() => ctx.toggle(node.id)}
                    label={node.title}
                  />
                ) : (
                  <span className="size-5 shrink-0" />
                )}
                <PageIcon
                  name={node.icon}
                  className={cn(
                    "size-3.5 shrink-0",
                    active ? "text-accent-foreground" : "text-muted-foreground/80",
                  )}
                />
                <span className="truncate">{node.title}</span>
                {node.internal && (
                  <Lock className="size-3 shrink-0 text-amber-600" />
                )}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => hasChildren && ctx.toggle(node.id)}
                className="mt-3 flex w-full items-center gap-1 rounded-md py-1 pl-1 pr-2.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:text-foreground"
              >
                {hasChildren && (
                  <CollapseChevron
                    open={open}
                    onToggle={() => ctx.toggle(node.id)}
                    label={node.title}
                  />
                )}
                <PageIcon name={node.icon} className="size-3 shrink-0" />
                {node.title}
                {node.internal && <Lock className="size-3 shrink-0" />}
              </button>
            )}
            {hasChildren && open && (
              <NavItems nodes={node.children} depth={depth + 1} ctx={ctx} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function collectParentIds(nodes: NavNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (node.children.length > 0) {
      into.push(node.id);
      collectParentIds(node.children, into);
    }
  }
  return into;
}

export function PublicNav({ nodes }: { nodes: NavNode[] }) {
  const pathname = usePathname();
  // sections start collapsed; the active page's trail is expanded below
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(collectParentIds(nodes)),
  );

  // ancestors of every path, so the active page's trail auto-expands
  const ancestorsByHref = useMemo(() => {
    const map = new Map<string, string[]>();
    const walk = (list: NavNode[], trail: string[]) => {
      for (const node of list) {
        const href = node.isHome ? "/" : `/${node.path}`;
        map.set(href, trail);
        walk(node.children, [...trail, node.id]);
      }
    };
    walk(nodes, []);
    return map;
  }, [nodes]);

  useEffect(() => {
    const trail = ancestorsByHref.get(pathname);
    if (!trail || trail.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- must run post-hydration so SSR markup matches
    setCollapsed((prev) => {
      if (!trail.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      trail.forEach((id) => next.delete(id));
      return next;
    });
  }, [pathname, ancestorsByHref]);

  const ctx: NavCtx = {
    collapsed,
    toggle: (id) =>
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
  };

  return <NavItems nodes={nodes} depth={0} ctx={ctx} />;
}
