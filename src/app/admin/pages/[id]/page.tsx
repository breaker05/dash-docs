import { notFound } from "next/navigation";
import { db } from "@/db";
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
  const [allTags, selectedTagIds] = await Promise.all([
    listTags(db),
    getPageTagIds(db, id),
  ]);

  return (
    <PageEditor
      key={page.id}
      role={user.role}
      tags={{
        all: allTags.map((t) => ({ id: t.id, name: t.name })),
        selected: selectedTagIds,
      }}
      page={{
        id: page.id,
        title: page.title,
        contentMd: page.contentMd,
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
