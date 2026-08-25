import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { db } from "@/db";
import { getTree, type TreeNode } from "@/server/pages/tree";
import { PageTree, type TreeItem } from "@/components/admin/page-tree";
import { NewPageButton } from "@/components/admin/new-page-button";
import { Button } from "@/components/ui/button";
import { DashLogo } from "@/components/brand/dash-logo";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { ExternalLink, Settings, Tags, Users } from "lucide-react";

function toItems(nodes: TreeNode[]): TreeItem[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    slug: n.slug,
    parentId: n.parentId,
    isHome: n.isHome,
    icon: n.icon,
    effectiveVisibility: n.effectiveVisibility,
    published: n.publishedContentMd !== null,
    hasUnpublishedChanges:
      n.publishedAt !== null && n.draftUpdatedAt > n.publishedAt,
    children: toItems(n.children),
  }));
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/admin");

  const tree = await getTree(db);

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-76 shrink-0 flex-col border-r bg-muted/30">
        <div className="flex h-14 items-center justify-between border-b px-4">
          <Link href="/admin" className="flex items-center gap-2">
            <DashLogo className="h-3 w-auto text-foreground" />
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-primary">
              Docs
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={<Link href="/" target="_blank" title="View the public site" />}
          >
            <ExternalLink className="size-4" />
          </Button>
        </div>

        <div className="px-3 pb-1 pt-3">
          <NewPageButton />
        </div>

        <ScrollArea className="flex-1 px-2 py-2">
          {tree.length > 0 ? (
            <PageTree items={toItems(tree)} />
          ) : (
            <div className="mx-1 mt-2 rounded-xl border border-dashed bg-background p-4 text-[0.85rem] leading-relaxed text-muted-foreground">
              <p className="mb-1.5 font-medium text-foreground">
                No pages yet
              </p>
              <p>
                Create your first page above, then drag pages onto each other
                to nest them into sections. Pages start as drafts — nothing is
                public until an admin publishes it.
              </p>
            </div>
          )}
        </ScrollArea>

        {tree.length > 0 && (
          <div className="border-t px-4 py-2.5 text-[0.7rem] text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-green-500" /> Live
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-amber-500" /> Edited
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-muted-foreground/40" />{" "}
                Draft
              </span>
            </div>
          </div>
        )}

        <div className="border-t px-3 py-2 text-sm">
          <Link
            href="/admin/tags"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Tags className="size-4" /> Feature tags
          </Link>
          {session.user.role === "admin" && (
            <>
              <Link
                href="/admin/users"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Users className="size-4" /> Team
              </Link>
              <Link
                href="/admin/settings"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Settings className="size-4" /> Settings
              </Link>
            </>
          )}
        </div>

        <div className="border-t px-4 py-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{session.user.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {session.user.email} ·{" "}
                <span className="capitalize">{session.user.role}</span>
              </p>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button variant="ghost" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
      <Toaster />
    </div>
  );
}
