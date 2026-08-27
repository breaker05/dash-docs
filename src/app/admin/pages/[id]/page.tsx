import { notFound } from "next/navigation";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { getPage } from "@/server/pages/tree";
import { getPageTagIds, listTags } from "@/server/tags";
import { requireUser } from "@/server/auth-guards";
import { PageEditor } from "@/components/admin/editor";

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const page = await getPage(db, id);
  if (!page) notFound();
  const [allTags, selectedTagIds, linkTargets] = await Promise.all([
    listTags(db),
    getPageTagIds(db, id),
    db
      .select({
        id: pages.id,
        title: pages.title,
        path: pages.path,
        isHome: pages.isHome,
        published: sql<boolean>`${pages.publishedContentMd} is not null`,
      })
      .from(pages)
      .orderBy(asc(pages.path)),
  ]);

  return (
    <PageEditor
      key={page.id}
      role={user.role}
      linkTargets={linkTargets}
      tags={{
        all: allTags.map((t) => ({ id: t.id, name: t.name })),
        selected: selectedTagIds,
      }}
      page={{
        id: page.id,
        title: page.title,
        contentMd: page.contentMd,
        draftUpdatedAt: page.draftUpdatedAt.toISOString(),
        slug: page.slug,
        path: page.path,
        isHome: page.isHome,
        icon: page.icon,
        pdfChrome: page.pdfChrome,
        visibility: page.visibility,
        effectiveVisibility: page.effectiveVisibility,
        published: page.publishedContentMd !== null,
        hasUnpublishedChanges:
          page.publishedAt !== null && page.draftUpdatedAt > page.publishedAt,
      }}
    />
  );
}
