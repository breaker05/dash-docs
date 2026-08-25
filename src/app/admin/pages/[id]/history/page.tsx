import Link from "next/link";
import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getPage } from "@/server/pages/tree";
import { listRevisions } from "@/server/pages/revisions";
import { requireUser } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const KIND_LABEL: Record<string, string> = {
  publish: "Published",
  manual: "Saved version",
  pre_restore: "Before restore",
  import: "Imported",
};

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const page = await getPage(db, id);
  if (!page) notFound();

  const revisions = await listRevisions(db, id);
  const authorIds = [
    ...new Set(revisions.map((r) => r.createdBy).filter((v): v is string => !!v)),
  ];
  const authors =
    authorIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, authorIds))
      : [];
  const authorById = new Map(authors.map((a) => [a.id, a]));

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <Link
        href={`/admin/pages/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to editor
      </Link>
      <h1 className="mb-1 text-xl font-semibold">History — {page.title}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Published versions are kept forever; the newest 50 other snapshots are
        retained.
      </p>
      {revisions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No versions yet. Versions are created when the page is published or
          when you press “Save version”.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {revisions.map((rev) => (
              <TableRow key={rev.id}>
                <TableCell>
                  <Link
                    href={`/admin/pages/${id}/history/${rev.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    v{rev.version}
                  </Link>
                  {rev.id === page.publishedRevisionId && (
                    <Badge className="ml-2 bg-green-500/15 text-green-700">
                      Live
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{KIND_LABEL[rev.kind] ?? rev.kind}</TableCell>
                <TableCell>
                  {rev.createdBy
                    ? (authorById.get(rev.createdBy)?.name ??
                      authorById.get(rev.createdBy)?.email ??
                      "Unknown")
                    : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {rev.createdAt.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
