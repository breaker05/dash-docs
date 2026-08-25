import Link from "next/link";
import { Tag } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { getPublicTags } from "@/server/tags";

export const metadata = { title: "Browse by tag — Dash Marketing Docs" };

export default async function TagsIndexPage() {
  const session = await auth();
  const tags = await getPublicTags(db, Boolean(session?.user));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-[1.6rem] font-bold tracking-tight">
        Browse by tag
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Every published page, grouped by product feature.
      </p>
      {tags.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No tagged pages yet.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.slug}`}
              className="group flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-ring/50 hover:bg-muted"
            >
              <Tag className="size-3.5 text-primary" />
              <span className="font-medium">{tag.name}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground group-hover:bg-background">
                {tag.count}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
