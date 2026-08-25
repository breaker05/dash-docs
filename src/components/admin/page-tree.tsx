"use client";

import { useMemo, useState } from "react";
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
import { FileText, GripVertical, Home, Lock } from "lucide-react";
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

type FlatItem = TreeItem & { depth: number };

const INDENT = 20;

function flatten(items: TreeItem[], depth = 0): FlatItem[] {
  return items.flatMap((item) => [
    { ...item, depth },
    ...flatten(item.children, depth + 1),
  ]);
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
}: {
  item: FlatItem;
  active: boolean;
  projectedDepth: number | null;
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
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  const flat = useMemo(() => {
    const all = flatten(items);
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
  }, [items, activeId]);

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
