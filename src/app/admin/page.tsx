import Link from "next/link";
import { inArray, isNotNull } from "drizzle-orm";
import { FilePlus2, MousePointer2, Send, Tags } from "lucide-react";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { getPageIdsForTag, listTags } from "@/server/tags";
import { requireUser } from "@/server/auth-guards";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  {
    icon: FilePlus2,
    title: "Create a page",
    body: "Use “New page” in the sidebar. Every page starts as a private draft.",
  },
  {
    icon: MousePointer2,
    title: "Organize the tree",
    body: "Drag pages onto each other to nest them into sections; drag sideways to reorder. Old URLs redirect automatically when published pages move.",
  },
  {
    icon: Tags,
    title: "Tag by feature",
    body: "Add feature tags in the editor’s side panel so pages stay findable as the docs grow.",
  },
  {
    icon: Send,
    title: "Publish",
    body: "An admin presses Publish to put a page live. Editing afterwards never changes the live page until it’s re-published — and History can restore any version.",
  },
];

export default async function AdminIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const user = await requireUser();
  const { tag } = await searchParams;
  const tags = await listTags(db);
  const published =
    (
      await db
        .select({ id: pages.id })
        .from(pages)
        .where(isNotNull(pages.publishedContentMd))
        .limit(1)
    ).length > 0;

  let filtered: { id: string; title: string; path: string }[] | null = null;
  if (tag) {
    const ids = await getPageIdsForTag(db, tag);
    filtered =
      ids.length > 0
        ? await db
            .select({ id: pages.id, title: pages.title, path: pages.path })
            .from(pages)
            .where(inArray(pages.id, ids))
        : [];
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-12">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight">
        Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}
      </h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-muted-foreground">
        Pick a page from the sidebar to edit it, or create a new one.
        {!published &&
          " Nothing is live yet — here’s how the flow works:"}
      </p>

      <div className="mb-10 grid gap-3 sm:grid-cols-2">
        {STEPS.map((step) => (
          <div
            key={step.title}
            className="rounded-xl border bg-background p-4 transition-colors hover:border-ring/40"
          >
            <step.icon className="mb-2.5 size-4.5 text-primary" />
            <p className="mb-1 text-sm font-semibold">{step.title}</p>
            <p className="text-[0.85rem] leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </div>
        ))}
      </div>

      {user.role === "editor" && (
        <p className="mb-8 rounded-lg border border-dashed px-4 py-3 text-[0.85rem] text-muted-foreground">
          You’re an <strong>editor</strong> — you can write and save drafts,
          but publishing and deleting need an <strong>admin</strong>. Any admin
          can promote you from the Team page.
        </p>
      )}

      {tags.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filter by feature tag
          </p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <Link
                key={t.id}
                href={t.slug === tag ? "/admin" : `/admin?tag=${t.slug}`}
              >
                <Badge variant={t.slug === tag ? "default" : "outline"}>
                  {t.name}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {filtered !== null && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Pages tagged “{tag}”
          </p>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pages carry this tag yet. Open a page and toggle the tag in
              its side panel.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/pages/${p.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {p.title}
                  </Link>
                  <span className="ml-2 text-xs text-muted-foreground">
                    /{p.path}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
