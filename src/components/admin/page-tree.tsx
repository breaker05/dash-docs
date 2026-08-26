"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, FileText, GripVertical, Home, Lock } from "lucide-react";
import { toast } from "sonner";
import { movePageAction } from "@/server/actions/pages";
import { PageIcon } from "@/lib/page-icons";
import { cn } from "@/lib/utils";

export type TreeItem = {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  isHome: boolean;
  icon: string | null;
  effectiveVisibility: "public" | "internal";
  published: boolean;
  hasUnpublishedChanges: boolean;
  children: TreeItem[];
};

type FlatItem = TreeItem & { depth: number; childCount: number };

const INDENT = 20;
const EXPANDED_STORAGE_KEY = "dash-docs.admin-tree.expanded";

function flatten(
  items: TreeItem[],
  collapsed: Set<string>,
  depth = 0,
): FlatItem[] {
  return items.flatMap((item) => [
    { ...item, depth, childCount: item.children.length },
    ...(collapsed.has(item.id)
      ? []
      : flatten(item.children, collapsed, depth + 1)),
  ]);
}

function collectParentIds(items: TreeItem[], into: string[] = []): string[] {
  for (const item of items) {
    if (item.children.length > 0) {
      into.push(item.id);
      collectParentIds(item.children, into);
    }
  }
  return into;
}

// Standard dnd-kit tree projection: vertical order comes from the sortable
// list; horizontal pointer offset picks the depth between the bounds allowed
// by the neighbors at the drop position.
function getProjection(
  items: FlatItem[],
  activeId: string,
  overId: string,
  dragOffset: number,
) {
  const overIndex = items.findIndex(({ id }) => id === overId);
  const activeIndex = items.findIndex(({ id }) => id === activeId);
  const activeItem = items[activeIndex];
  const newItems = arrayMove(items, activeIndex, overIndex);
  const previousItem = newItems[overIndex - 1];
  const nextItem = newItems[overIndex + 1];
  const projectedDepth = activeItem.depth + Math.round(dragOffset / INDENT);
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;
  const depth = Math.min(Math.max(projectedDepth, minDepth), maxDepth);

  let parentId: string | null = null;
  if (depth !== 0 && previousItem) {
    if (depth === previousItem.depth) {
      parentId = previousItem.parentId;
    } else if (depth > previousItem.depth) {
      parentId = previousItem.id;
    } else {
      parentId =
        newItems
          .slice(0, overIndex)
          .reverse()
          .find((item) => item.depth === depth)?.parentId ?? null;
    }
  }

  // index among the new siblings at the drop position
  let newIndex = 0;
  for (const item of newItems) {
    if (item.id === activeId) break;
    if (item.parentId === parentId && item.id !== activeId) newIndex++;
  }
  // items being re-parented: count preceding entries that will share the parent
  if (parentId !== activeItem.parentId || depth !== activeItem.depth) {
    newIndex = 0;
    for (let i = 0; i < overIndex; i++) {
      const item = newItems[i];
      if (item.id === activeId) continue;
      if (
        (item.parentId === parentId && item.depth === depth) ||
        (parentId === item.id && false)
      ) {
        newIndex++;
      }
    }
  }
  return { depth, parentId, newIndex };
}

function TreeRow({
  item,
  active,
  projectedDepth,
  open,
  onToggle,
}: {
  item: FlatItem;
  active: boolean;
  projectedDepth: number | null;
  open: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const depth = isDragging && projectedDepth !== null ? projectedDepth : item.depth;
  const isCurrent = pathname === `/admin/pages/${item.id}`;
  const hasChildren = item.childCount > 0;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        paddingLeft: depth * INDENT,
      }}
      className={cn("list-none", isDragging && "opacity-40")}
    >
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-accent",
          isCurrent && "bg-accent font-medium",
          active && "ring-1 ring-ring",
        )}
      >
        <button
          className="cursor-grab touch-none opacity-0 group-hover:opacity-60"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${item.title}`}
        >
          <GripVertical className="size-3.5" />
        </button>
        {hasChildren ? (
          <button
            type="button"
            aria-label={`${open ? "Collapse" : "Expand"} ${item.title}`}
            aria-expanded={open}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle();
            }}
            className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-border/60 hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform duration-150",
                open && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        {item.isHome ? (
          <Home className="size-3.5 shrink-0 text-muted-foreground" />
        ) : item.icon ? (
          <PageIcon
            name={item.icon}
            className="size-3.5 shrink-0 text-muted-foreground"
          />
        ) : (
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <Link
          href={`/admin/pages/${item.id}`}
          className="flex-1 truncate"
          title={item.title}
        >
          {item.title}
        </Link>
        {hasChildren && !open && (
          <span className="shrink-0 rounded-full bg-muted-foreground/10 px-1.5 text-[0.65rem] tabular-nums text-muted-foreground">
            {item.childCount}
          </span>
        )}
        {item.effectiveVisibility === "internal" && (
          <Lock className="size-3 shrink-0 text-amber-600" />
        )}
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            item.published
              ? item.hasUnpublishedChanges
                ? "bg-amber-500"
                : "bg-green-500"
              : "bg-muted-foreground/40",
          )}
          title={
            item.published
              ? item.hasUnpublishedChanges
                ? "Published · edited"
                : "Published"
              : "Draft"
          }
        />
      </div>
    </li>
  );
}

export function PageTree({ items }: { items: TreeItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  // sections start collapsed so long trees stay scannable; the active page's
  // trail and any sections the editor expanded (persisted below) reopen
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(collectParentIds(items)),
  );

  const allParentIds = useMemo(() => collectParentIds(items), [items]);

  // restore the editor's expanded sections after mount (localStorage is
  // unavailable during SSR, so this must not run in the initial render)
  useEffect(() => {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(EXPANDED_STORAGE_KEY) ?? "[]",
      );
      if (!Array.isArray(saved) || saved.length === 0) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unavailable during SSR; must adjust post-hydration
      setCollapsed((prev) => {
        const next = new Set(prev);
        for (const id of saved) next.delete(String(id));
        return next;
      });
    } catch {
      // ignore unreadable storage
    }
  }, []);

  // ancestors of every page id, so the edited page's trail auto-expands
  const ancestorsById = useMemo(() => {
    const map = new Map<string, string[]>();
    const walk = (list: TreeItem[], trail: string[]) => {
      for (const node of list) {
        map.set(node.id, trail);
        walk(node.children, [...trail, node.id]);
      }
    };
    walk(items, []);
    return map;
  }, [items]);

  useEffect(() => {
    const match = pathname.match(/^\/admin\/pages\/([^/]+)/);
    const trail = match ? ancestorsById.get(match[1]) : undefined;
    if (!trail || trail.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- must run post-hydration so SSR markup matches
    setCollapsed((prev) => {
      if (!trail.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      trail.forEach((id) => next.delete(id));
      return next;
    });
  }, [pathname, ancestorsById]);

  function persistExpanded(nextCollapsed: Set<string>) {
    try {
      window.localStorage.setItem(
        EXPANDED_STORAGE_KEY,
        JSON.stringify(allParentIds.filter((id) => !nextCollapsed.has(id))),
      );
    } catch {
      // storage may be unavailable; collapse state still works in-memory
    }
  }

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistExpanded(next);
      return next;
    });
  }

  const flat = useMemo(() => {
    const all = flatten(items, collapsed);
    if (!activeId) return all;
    // while dragging, hide the active item's descendants
    const activeIndex = all.findIndex((i) => i.id === activeId);
    if (activeIndex === -1) return all;
    const activeDepth = all[activeIndex].depth;
    return all.filter((item, index) => {
      if (index <= activeIndex) return true;
      let i = index;
      // descendant iff every step back up to active stays deeper
      if (item.depth > activeDepth) {
        for (i = index - 1; i >= 0; i--) {
          if (all[i].depth < item.depth) break;
        }
        let cursor: string | null = item.parentId;
        const byId = new Map(all.map((x) => [x.id, x]));
        while (cursor) {
          if (cursor === activeId) return false;
          cursor = byId.get(cursor)?.parentId ?? null;
        }
      }
      return true;
    });
  }, [items, activeId, collapsed]);

  const projected =
    activeId && overId
      ? getProjection(flat, activeId, overId, offsetLeft)
      : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    setOverId(String(active.id));
  }
  function handleDragMove({ delta }: DragMoveEvent) {
    setOffsetLeft(delta.x);
  }

  async function handleDragEnd({ active, over }: DragEndEvent) {
    const projection =
      over && activeId ? getProjection(flat, String(active.id), String(over.id), offsetLeft) : null;
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
    if (!projection) return;
    // dropping into a collapsed section: expand it so the page doesn't vanish
    if (projection.parentId && collapsed.has(projection.parentId)) {
      const parentId = projection.parentId;
      setCollapsed((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        return next;
      });
    }
    try {
      await movePageAction({
        id: String(active.id),
        newParentId: projection.parentId,
        newIndex: projection.newIndex,
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Move failed");
    }
  }

  const activeItem = activeId ? flat.find((i) => i.id === activeId) : null;

  return (
    <DndContext
      // stable id: dnd-kit otherwise derives aria-describedby from a
      // module-level counter that differs between server and client render
      // passes, causing a hydration attribute mismatch
      id="page-tree-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={({ over }) => setOverId(over ? String(over.id) : null)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        setOverId(null);
        setOffsetLeft(0);
      }}
    >
      <SortableContext
        items={flat.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="space-y-0.5">
          {flat.map((item) => (
            <TreeRow
              key={item.id}
              item={item}
              active={item.id === activeId}
              projectedDepth={
                item.id === activeId && projected ? projected.depth : null
              }
              open={!collapsed.has(item.id)}
              onToggle={() => toggleCollapsed(item.id)}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay>
        {activeItem ? (
          <div className="rounded-md border bg-background px-2 py-1 text-sm shadow-md">
            {activeItem.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
