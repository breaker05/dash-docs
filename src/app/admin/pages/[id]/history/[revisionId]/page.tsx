import Link from "next/link";
import { notFound } from "next/navigation";
import { diffLines } from "diff";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { getPage } from "@/server/pages/tree";
import { getRevision } from "@/server/pages/revisions";
import { requireUser } from "@/server/auth-guards";
import { renderMarkdoc } from "@/lib/markdoc/render";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RestoreButton } from "@/components/admin/restore-button";
import { cn } from "@/lib/utils";

export default async function RevisionPage({
  params,
}: {
  params: Promise<{ id: string; revisionId: string }>;
}) {
  await requireUser();
  const { id, revisionId } = await params;
  const [page, revision] = await Promise.all([
    getPage(db, id),
    getRevision(db, revisionId),
  ]);
  if (!page || !revision || revision.pageId !== id) notFound();

  const diff = diffLines(page.contentMd, revision.contentMd);
  const identical = diff.every((part) => !part.added && !part.removed);

  return (
    <div className="mx-auto max-w-4xl px-8 py-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link
          href={`/admin/pages/${id}/history`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All versions
        </Link>
        <RestoreButton pageId={id} revisionId={revision.id} />
      </div>
      <h1 className="mb-1 text-xl font-semibold">
        v{revision.version} — {revision.title}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {revision.createdAt.toLocaleString()} · restoring copies this version
        into the draft (the live page is not changed until you publish).
      </p>

      <Tabs defaultValue="diff">
        <TabsList>
          <TabsTrigger value="diff">Changes vs current draft</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="raw">Markdown</TabsTrigger>
        </TabsList>
        <TabsContent value="diff" className="mt-4">
          {identical ? (
            <p className="text-sm text-muted-foreground">
              This version is identical to the current draft.
            </p>
          ) : (
            <pre className="overflow-x-auto rounded-lg border text-xs leading-5">
              {diff.map((part, i) => (
                <span
                  key={i}
                  className={cn(
                    "block whitespace-pre-wrap px-3",
                    part.added && "bg-green-50 text-green-800",
                    part.removed && "bg-red-50 text-red-800 line-through",
                  )}
                >
                  {part.value}
                </span>
              ))}
            </pre>
          )}
        </TabsContent>
        <TabsContent value="preview" className="mt-4">
          <div className="prose prose-neutral max-w-none rounded-lg border p-6">
            {renderMarkdoc(revision.contentMd)}
          </div>
        </TabsContent>
        <TabsContent value="raw" className="mt-4">
          <pre className="overflow-x-auto rounded-lg border p-4 text-xs">
            {revision.contentMd}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
