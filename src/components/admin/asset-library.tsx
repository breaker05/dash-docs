"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  History,
  ImageOff,
  Search,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { deleteAssetsAction } from "@/server/actions/assets";
import type { AssetPageUsage, AssetStatus } from "@/server/assets";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AssetRow = {
  id: string;
  blobUrl: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  uploadedByName: string | null;
  pages: AssetPageUsage[];
  historyPageCount: number;
  settingKeys: string[];
  status: AssetStatus;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "in-use", label: "In use" },
  { key: "history", label: "History only" },
  { key: "unused", label: "Unused" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

const PAGE_SIZE = 24;

const SETTING_LABELS: Record<string, string> = {
  "pdf.logoUrl": "PDF logo",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssetLibrary({
  assets,
  canDelete,
}: {
  assets: AssetRow[];
  canDelete: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: assets.length,
      "in-use": 0,
      history: 0,
      unused: 0,
    };
    for (const a of assets) c[a.status]++;
    return c;
  }, [assets]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter(
      (a) =>
        (filter === "all" || a.status === filter) &&
        (!q ||
          a.filename.toLowerCase().includes(q) ||
          a.pages.some((p) => p.title.toLowerCase().includes(q))),
    );
  }, [assets, filter, query]);

  // clamp rather than reset in an effect: deletes shrink the list under us
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const pageItems = visible.slice(
    current * PAGE_SIZE,
    (current + 1) * PAGE_SIZE,
  );

  const unused = assets.filter((a) => a.status === "unused");
  const unusedBytes = unused.reduce((n, a) => n + a.sizeBytes, 0);

  function remove(ids: string[], label: string) {
    startTransition(async () => {
      try {
        const out = await deleteAssetsAction({ ids });
        if ("error" in out) toast.error(out.error);
        else toast.success(`Deleted ${label}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  if (assets.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        No images uploaded yet. Drag, paste or use the toolbar in the page
        editor to add one.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setFilter(f.key);
                setPage(0);
              }}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}{" "}
              <span className="tabular-nums opacity-60">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <div className="relative w-56">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Filter by file or page"
            className="pl-8"
          />
        </div>
        {canDelete && unused.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto text-destructive"
                  disabled={pending}
                />
              }
            >
              <Trash2 /> Delete {unused.length} unused
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete {unused.length} unused{" "}
                  {unused.length === 1 ? "image" : "images"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Frees {formatBytes(unusedBytes)}. None of these are
                  referenced by a page, its history or a setting. Links to them
                  from outside the docs will stop working. This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() =>
                    remove(
                      unused.map((a) => a.id),
                      `${unused.length} unused ${unused.length === 1 ? "image" : "images"}`,
                    )
                  }
                >
                  Delete all unused
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          No images match.
        </p>
      ) : (
        <>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
            {pageItems.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                canDelete={canDelete}
                pending={pending}
                onDelete={() => remove([a.id], `“${a.filename}”`)}
              />
            ))}
          </ul>
          {pageCount > 1 && (
            <Pager
              page={current}
              pageCount={pageCount}
              total={visible.length}
              onChange={(p) => {
                setPage(p);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Page numbers to show: first, last, and a window around the current one. */
function pageList(page: number, pageCount: number): (number | "gap")[] {
  const out: (number | "gap")[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (i === 0 || i === pageCount - 1 || Math.abs(i - page) <= 1) out.push(i);
    else if (out.at(-1) !== "gap") out.push("gap");
  }
  return out;
}

function Pager({
  page,
  pageCount,
  total,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const first = page * PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <nav
      aria-label="Image pages"
      className="flex flex-wrap items-center justify-between gap-2 pt-2"
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          title="Previous page"
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        {pageList(page, pageCount).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={p === page ? "secondary" : "ghost"}
              aria-current={p === page ? "page" : undefined}
              className="min-w-8 tabular-nums"
              onClick={() => onChange(p)}
            >
              {p + 1}
            </Button>
          ),
        )}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          title="Next page"
          disabled={page === pageCount - 1}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

function AssetCard({
  asset: a,
  canDelete,
  pending,
  onDelete,
}: {
  asset: AssetRow;
  canDelete: boolean;
  pending: boolean;
  onDelete: () => void;
}) {
  const [broken, setBroken] = useState(false);

  return (
    <li className="flex flex-col overflow-hidden rounded-lg border bg-background">
      <a
        href={a.blobUrl}
        target="_blank"
        rel="noreferrer"
        className="relative block aspect-[4/3] bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px]"
      >
        {broken ? (
          <span className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-6" />
          </span>
        ) : (
          <Image
            src={a.blobUrl}
            alt={a.filename}
            fill
            sizes="16rem"
            unoptimized={a.contentType === "image/svg+xml"}
            className="object-contain p-2"
            onError={() => setBroken(true)}
          />
        )}
        <StatusPill status={a.status} />
      </a>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={a.filename}>
            {a.filename}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {formatBytes(a.sizeBytes)} ·{" "}
            {new Date(a.createdAt).toLocaleDateString()}
            {a.uploadedByName && ` · ${a.uploadedByName}`}
          </p>
        </div>

        <Usage asset={a} />

        <div className="mt-auto flex items-center gap-1 pt-1">
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            title="Copy URL"
            onClick={async () => {
              await navigator.clipboard.writeText(a.blobUrl);
              toast.success("URL copied");
            }}
          >
            <Copy />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            title="Open original"
            nativeButton={false}
            render={<a href={a.blobUrl} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink />
          </Button>
          {canDelete && a.status !== "in-use" && (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    title="Delete"
                    className="ml-auto text-destructive"
                    disabled={pending}
                  />
                }
              >
                <Trash2 />
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{a.filename}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {a.status === "history"
                      ? `No current page uses it, but ${a.historyPageCount} ${a.historyPageCount === 1 ? "page's" : "pages'"} version history does — restoring those versions would show a broken image. `
                      : "No page, version history or setting references it. "}
                    This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={onDelete}
                  >
                    Delete image
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </li>
  );
}

function StatusPill({ status }: { status: AssetStatus }) {
  const styles: Record<AssetStatus, [string, string]> = {
    "in-use": ["In use", "bg-green-500/15 text-green-700 dark:text-green-400"],
    history: ["History only", "bg-amber-500/15 text-amber-700 dark:text-amber-400"],
    unused: ["Unused", "bg-muted text-muted-foreground"],
  };
  const [label, cls] = styles[status];
  return (
    <span
      className={cn(
        "absolute top-2 left-2 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold backdrop-blur",
        cls,
      )}
    >
      {label}
    </span>
  );
}

function Usage({ asset: a }: { asset: AssetRow }) {
  if (a.status === "unused") {
    return (
      <p className="text-xs text-muted-foreground">Not used anywhere.</p>
    );
  }
  return (
    <ul className="space-y-1 text-xs">
      {a.pages.map((p) => (
        <li key={p.pageId} className="flex items-center gap-1.5">
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <Link
            href={`/admin/pages/${p.pageId}`}
            className="min-w-0 truncate hover:underline"
            title={p.isHome ? "/" : `/${p.path}`}
          >
            {p.title}
          </Link>
          <span className="ml-auto shrink-0 text-muted-foreground">
            {p.inPublished && p.inDraft
              ? "live"
              : p.inPublished
                ? "live, removed in draft"
                : "draft only"}
          </span>
        </li>
      ))}
      {a.settingKeys.map((key) => (
        <li key={key} className="flex items-center gap-1.5">
          <Settings className="size-3.5 shrink-0 text-muted-foreground" />
          <Link href="/admin/settings" className="truncate hover:underline">
            {SETTING_LABELS[key] ?? key}
          </Link>
        </li>
      ))}
      {a.historyPageCount > 0 && (
        <li className="flex items-center gap-1.5 text-muted-foreground">
          <History className="size-3.5 shrink-0" />
          In version history of {a.historyPageCount}{" "}
          {a.historyPageCount === 1 ? "page" : "pages"}
        </li>
      )}
    </ul>
  );
}
