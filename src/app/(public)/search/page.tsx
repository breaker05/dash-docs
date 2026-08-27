import Link from "next/link";
import { Lock, SearchX, Tag as TagIcon } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { pages, searchLog } from "@/db/schema";
import { searchPages } from "@/server/search";
import { getPublicTags } from "@/server/tags";
import { cn } from "@/lib/utils";

export const metadata = { title: "Search — Dash Marketing Docs" };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { q, tag } = await searchParams;
  const session = await auth();
  const [hits, browseTags] = await Promise.all([
    q
      ? searchPages(db, {
          query: q,
          includeInternal: Boolean(session?.user),
          tagSlug: tag,
        })
      : Promise.resolve([]),
    getPublicTags(db, Boolean(session?.user)),
  ]);
  const activeTag = tag ? browseTags.find((t) => t.slug === tag) : undefined;

  // anonymous queries feed the search-gaps report (fire-and-forget)
  if (q?.trim() && !session?.user && !tag) {
    db.insert(searchLog)
      .values({ query: q.trim().slice(0, 200), resultCount: hits.length })
      .catch(() => {});
  }

  // badge internal results for signed-in users
  const internalPaths = new Set<string>();
  if (session?.user && hits.length > 0) {
    const rows = await db
      .select({ path: pages.path })
      .from(pages)
      .where(eq(pages.effectiveVisibility, "internal"));
    rows.forEach((r) => internalPaths.add(r.path));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-[1.6rem] font-bold tracking-tight">Search</h1>

      {!q ? (
        <div className="mt-10 space-y-6">
          <div className="rounded-xl border border-dashed p-8 text-center">
            <p className="text-[0.95rem] text-muted-foreground">
              Type in the search box above to search every published page —
              including code samples, so queries like{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em]">
                lead submit
              </code>{" "}
              or an endpoint path work too.
            </p>
          </div>
          {browseTags.length > 0 && (
            <div>
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Or browse by tag
              </p>
              <div className="flex flex-wrap gap-1.5">
                {browseTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={`/tags/${tag.slug}`}
                    className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
                  >
                    <TagIcon className="size-3 text-primary" />
                    {tag.name}
                    <span className="text-xs text-muted-foreground/70">
                      {tag.count}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            {hits.length} result{hits.length === 1 ? "" : "s"} for “{q}”
            {activeTag ? (
              <>
                {" "}
                tagged{" "}
                <span className="font-medium text-foreground">
                  {activeTag.name}
                </span>
              </>
            ) : null}
          </p>
          {browseTags.length > 0 && (
            <div className="mb-8 flex flex-wrap items-center gap-1.5">
              <Link
                href={`/search?q=${encodeURIComponent(q)}`}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  !tag
                    ? "border-primary bg-primary/10 text-primary"
                    : "text-muted-foreground hover:border-ring/50 hover:text-foreground",
                )}
              >
                All
              </Link>
              {browseTags.map((t) => (
                <Link
                  key={t.id}
                  href={
                    t.slug === tag
                      ? `/search?q=${encodeURIComponent(q)}`
                      : `/search?q=${encodeURIComponent(q)}&tag=${t.slug}`
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    t.slug === tag
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:border-ring/50 hover:text-foreground",
                  )}
                >
                  <TagIcon className="size-3" />
                  {t.name}
                </Link>
              ))}
            </div>
          )}
          <ul className="space-y-6">
            {hits.map((hit) => (
              <li key={hit.id}>
                <Link
                  href={`/${hit.path}`}
                  className="flex items-center gap-2 text-[1.05rem] font-semibold text-primary hover:underline"
                >
                  {hit.title}
                  {internalPaths.has(hit.path) && (
                    <Lock className="size-3.5 text-amber-600" />
                  )}
                </Link>
                <p className="text-[0.8rem] text-muted-foreground">
                  /{hit.path}
                </p>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-foreground/80">
                  {hit.snippet.split(/⟪|⟫/).map((part, i) =>
                    i % 2 === 1 ? (
                      <mark
                        key={i}
                        className="rounded-sm bg-primary/15 px-0.5 font-medium text-foreground"
                      >
                        {part}
                      </mark>
                    ) : (
                      <span key={i}>{part}</span>
                    ),
                  )}
                </p>
              </li>
            ))}
          </ul>
          {hits.length === 0 && (
            <div className="mt-6 rounded-xl border border-dashed p-8 text-center">
              <SearchX className="mx-auto mb-3 size-8 text-muted-foreground/60" />
              <p className="mb-2 font-medium">
                No matches for “{q}”
                {activeTag ? ` tagged ${activeTag.name}` : ""}
              </p>
              {activeTag && (
                <p className="mb-3 text-sm">
                  <Link
                    href={`/search?q=${encodeURIComponent(q)}`}
                    className="text-primary hover:underline"
                  >
                    Remove the “{activeTag.name}” filter
                  </Link>
                </p>
              )}
              <ul className="mx-auto max-w-xs space-y-1 text-left text-sm text-muted-foreground">
                <li>• Try fewer or more general keywords</li>
                <li>• Check the spelling of API and field names</li>
                <li>
                  • Or browse everything from the{" "}
                  <Link href="/" className="text-primary hover:underline">
                    docs home
                  </Link>
                </li>
              </ul>
              {!session?.user && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Team member? Internal pages only appear after you{" "}
                  <Link href="/signin" className="text-primary hover:underline">
                    sign in
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
