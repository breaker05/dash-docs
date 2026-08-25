"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  deletePageAction,
  renamePageAction,
  setHomePageAction,
  setVisibilityAction,
} from "@/server/actions/pages";
import { publishAction, unpublishAction } from "@/server/actions/publish";
import { saveVersionAction } from "@/server/actions/revisions";
import { setPageTagsAction } from "@/server/actions/tags";
import { setPdfChromeAction } from "@/server/actions/settings";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewPageButton } from "@/components/admin/new-page-button";
import { IconPicker } from "@/components/admin/icon-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export type PageMeta = {
  id: string;
  title: string;
  slug: string;
  path: string;
  isHome: boolean;
  icon: string | null;
  pdfChrome: boolean;
  visibility: "public" | "internal";
  effectiveVisibility: "public" | "internal";
  published: boolean;
  hasUnpublishedChanges: boolean;
};

export function MetadataPanel({
  page,
  role,
  tags,
}: {
  page: PageMeta;
  role: "editor" | "admin";
  tags: { all: { id: string; name: string }[]; selected: string[] };
}) {
  const [slug, setSlug] = useState(page.slug);
  const [selectedTags, setSelectedTags] = useState<string[]>(tags.selected);
  const [pending, startTransition] = useTransition();
  const inheritedInternal =
    page.effectiveVisibility === "internal" && page.visibility === "public";

  return (
    <aside className="w-80 shrink-0 space-y-5 overflow-y-auto border-l bg-muted/20 px-5 py-5 text-sm">
      <div className="space-y-1.5">
        <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Status
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {page.published ? (
            page.hasUnpublishedChanges ? (
              <Badge className="bg-amber-500/15 text-amber-700">
                Published · edited
              </Badge>
            ) : (
              <Badge className="bg-green-500/15 text-green-700">Published</Badge>
            )
          ) : (
            <Badge variant="secondary">Draft</Badge>
          )}
          {page.isHome && <Badge variant="outline">Home page</Badge>}
        </div>
        {role === "admin" ? (
          <div className="flex gap-1.5 pt-1">
            <Button
              size="sm"
              className="flex-1"
              disabled={pending || (page.published && !page.hasUnpublishedChanges)}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await publishAction({ id: page.id });
                    toast.success(
                      page.published ? "Changes published" : "Page published",
                    );
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Publish failed",
                    );
                  }
                })
              }
            >
              {page.published ? "Publish changes" : "Publish"}
            </Button>
            {page.published && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await unpublishAction({ id: page.id });
                      toast.success("Page unpublished");
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : "Unpublish failed",
                      );
                    }
                  })
                }
              >
                Unpublish
              </Button>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Your draft is saved automatically, but{" "}
            <strong>only an admin can publish</strong> it to the public site.
            Ping an admin when it’s ready for review.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <a
          href={`/api/pages/${page.id}/pdf?version=draft`}
          className="block text-xs text-primary hover:underline"
        >
          Download draft as PDF
        </a>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={page.pdfChrome}
            disabled={pending}
            onChange={(e) => {
              const next = e.target.checked;
              startTransition(async () => {
                try {
                  await setPdfChromeAction({
                    pageId: page.id,
                    pdfChrome: next,
                  });
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Update failed",
                  );
                }
              });
            }}
            className="size-3.5 accent-[var(--primary)]"
          />
          Default PDF header/footer
        </label>
      </div>

      <NewPageButton
        parentId={page.id}
        parentTitle={page.title}
        parentPath={page.path}
        triggerLabel="Create sub-page"
      />

      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await saveVersionAction({ pageId: page.id });
                toast.success("Version saved");
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Save version failed",
                );
              }
            })
          }
        >
          Save version
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          nativeButton={false}
          render={<Link href={`/admin/pages/${page.id}/history`} />}
        >
          History
        </Button>
      </div>

      <Separator />

      <div className="space-y-1.5">
        <Label htmlFor="page-slug" className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Slug
        </Label>
        <div className="flex gap-1.5">
          <Input
            id="page-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="h-8 font-mono text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending || slug === page.slug}
            onClick={() =>
              startTransition(async () => {
                try {
                  await renamePageAction({ id: page.id, slug });
                  toast.success("Slug updated");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Rename failed");
                  setSlug(page.slug);
                }
              })
            }
          >
            Apply
          </Button>
        </div>
        <p className="break-all text-xs text-muted-foreground">/{page.path}</p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Icon
        </Label>
        <IconPicker pageId={page.id} icon={page.icon} />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Visibility
        </Label>
        <Select
          value={page.visibility}
          disabled={pending}
          onValueChange={(v) =>
            startTransition(async () => {
              try {
                await setVisibilityAction({
                  id: page.id,
                  visibility: v as "public" | "internal",
                });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Update failed");
              }
            })
          }
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">
              <span className="flex items-center gap-2">
                <Globe className="size-3.5" /> Public
              </span>
            </SelectItem>
            <SelectItem value="internal">
              <span className="flex items-center gap-2">
                <Lock className="size-3.5" /> Internal (team only)
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        {inheritedInternal && (
          <p className="flex items-center gap-1 text-xs text-amber-700">
            <Lock className="size-3" /> Internal — inherited from a parent
            section
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
          Feature tags
        </Label>
        {tags.all.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No tags yet —{" "}
            <Link href="/admin/tags" className="text-primary hover:underline">
              create some
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.all.map((tag) => {
              const active = selectedTags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const next = active
                      ? selectedTags.filter((t) => t !== tag.id)
                      : [...selectedTags, tag.id];
                    setSelectedTags(next);
                    startTransition(async () => {
                      try {
                        await setPageTagsAction({
                          pageId: page.id,
                          tagIds: next,
                        });
                      } catch (e) {
                        setSelectedTags(selectedTags);
                        toast.error(
                          e instanceof Error ? e.message : "Tag update failed",
                        );
                      }
                    });
                  }}
                >
                  <Badge variant={active ? "default" : "outline"}>
                    {tag.name}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {page.published && (
        <div className="space-y-1.5">
          <Label className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Public link
          </Label>
          <Link
            href={page.isHome ? "/" : `/${page.path}`}
            target="_blank"
            className="block break-all text-xs text-primary hover:underline"
          >
            {page.isHome ? "/" : `/${page.path}`}
          </Link>
        </div>
      )}

      {role === "admin" && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </p>
            {!page.isHome && (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await setHomePageAction({ id: page.id });
                      toast.success("Set as home page");
                    } catch (e) {
                      toast.error(
                        e instanceof Error ? e.message : "Update failed",
                      );
                    }
                  })
                }
              >
                Set as home page
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-destructive"
                  />
                }
              >
                Delete page
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete “{page.title}”?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes the page and all of its
                    sub-pages, including their version history. This cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await deletePageAction({ id: page.id });
                        } catch (e) {
                          if (
                            e instanceof Error &&
                            e.message.includes("NEXT_REDIRECT")
                          ) {
                            throw e;
                          }
                          toast.error(
                            e instanceof Error ? e.message : "Delete failed",
                          );
                        }
                      })
                    }
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </aside>
  );
}
