import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { and, eq, isNotNull } from "drizzle-orm";
import { Lock, Tag as TagIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { findRedirect } from "@/server/pages/tree";
import { getTagsForPage } from "@/server/tags";
import { renderMarkdoc } from "@/lib/markdoc/render";
import { Badge } from "@/components/ui/badge";
import { DashLogo } from "@/components/brand/dash-logo";
import { PageActions } from "@/components/public/page-actions";
import { PageFeedback } from "@/components/public/feedback";
import { PageIcon } from "@/lib/page-icons";
import type { Page } from "@/db/schema";

type Params = { slug?: string[] };

async function resolvePage(slugSegments: string[] | undefined): Promise<{
  page: Page | null;
  redirectTo: string | null;
}> {
  if (!slugSegments || slugSegments.length === 0) {
    const [home] = await db.select().from(pages).where(eq(pages.isHome, true));
    return { page: home ?? null, redirectTo: null };
  }
  const path = slugSegments.map(decodeURIComponent).join("/");
  // pretty raw-markdown URLs: /lead-submission-api.md → the markdown endpoint
  if (path.endsWith(".md")) {
    return { page: null, redirectTo: `/api/md/${path.slice(0, -3)}` };
  }
  const [page] = await db.select().from(pages).where(eq(pages.path, path));
  if (page) return { page, redirectTo: null };

  const redirect = await findRedirect(db, path);
  return { page: null, redirectTo: redirect ? `/${redirect.toPath}` : null };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { page } = await resolvePage(slug);
  if (!page?.publishedTitle) return {};
  return {
    title: `${page.publishedTitle} — Dash Marketing Docs`,
  };
}

export default async function PublicPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const { page, redirectTo } = await resolvePage(slug);
  if (redirectTo) permanentRedirect(redirectTo);

  if (!page) {
    if (!slug || slug.length === 0) {
      // no home page yet — friendly empty state instead of a 404
      return (
        <div className="mx-auto max-w-md py-24 text-center">
          <div className="mb-6 flex justify-center">
            <DashLogo className="h-5 w-auto text-foreground" />
          </div>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">
            Docs are on the way
          </h1>
          <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
            Nothing has been published yet. If you’re on the Dash Marketing
            team, <Link href="/signin" className="font-medium text-primary hover:underline">sign in with your @dashmarketing.io account</Link>{" "}
            to start writing — pages appear here the moment an admin publishes
            them.
          </p>
        </div>
      );
    }
    notFound();
  }

  // unpublished → invisible; internal → invisible unless signed in.
  // 404 (not 401) so internal pages don't leak their existence.
  if (page.publishedContentMd === null) notFound();
  if (page.effectiveVisibility === "internal") {
    const session = await auth();
    if (!session?.user) notFound();
  }

  const [pageTags, publishedChildren] = await Promise.all([
    getTagsForPage(db, page.id),
    db
      .select({ id: pages.id })
      .from(pages)
      .where(
        and(eq(pages.parentId, page.id), isNotNull(pages.publishedContentMd)),
      )
      .limit(1),
  ]);

  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-8 border-b pb-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="flex items-center gap-3 text-[2.1rem] font-bold leading-tight tracking-tight">
            {page.icon && (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <PageIcon name={page.icon} className="size-5.5 text-primary" />
              </span>
            )}
            {page.publishedTitle}
          </h1>
          <div className="flex shrink-0 items-center gap-2 pt-2">
            {page.effectiveVisibility === "internal" && (
              <Badge className="bg-amber-500/15 text-amber-700">
                <Lock className="mr-1 size-3" /> Internal
              </Badge>
            )}
            <PageActions
              pageId={page.id}
              path={page.path}
              title={page.publishedTitle ?? page.title}
              markdown={page.publishedContentMd}
              isInternal={page.effectiveVisibility === "internal"}
              hasChildren={publishedChildren.length > 0}
            />
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          {page.publishedAt && (
            <p className="text-sm text-muted-foreground">
              Last updated{" "}
              {page.publishedAt.toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
          {pageTags.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              {pageTags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/tags/${tag.slug}`}
                  className="flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
                >
                  <TagIcon className="size-3 text-primary" />
                  {tag.name}
                </Link>
              ))}
            </span>
          )}
        </div>
      </header>
      <div className="prose prose-neutral max-w-none prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight prose-a:text-primary prose-a:decoration-primary/40 prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-th:text-[0.85rem] prose-td:text-[0.9rem] prose-img:rounded-lg prose-img:shadow-[0_2px_10px_rgba(0,0,0,0.10),0_1px_2px_rgba(0,0,0,0.06)] prose-img:ring-1 prose-img:ring-black/5 dark:prose-img:shadow-[0_2px_10px_rgba(0,0,0,0.5)] dark:prose-img:ring-white/10">
        {renderMarkdoc(page.publishedContentMd)}
      </div>
      <PageFeedback pageId={page.id} />
    </article>
  );
}
