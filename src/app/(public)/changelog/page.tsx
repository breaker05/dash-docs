import Link from "next/link";
import { History, Lock } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { recentPublishes } from "@/server/digest";

export const metadata = { title: "Changelog — Dash Marketing Docs" };

export default async function ChangelogPage() {
  const session = await auth();
  const entries = await recentPublishes(db, {
    includeInternal: Boolean(session?.user),
    limit: 50,
  });

  // group by calendar day
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) {
    const day = e.publishedAt.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(e);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 flex items-center gap-2">
        <History className="size-5 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">
          What&apos;s new
        </p>
      </div>
      <h1 className="mb-3 text-[1.9rem] font-bold leading-tight tracking-tight">
        Changelog
      </h1>
      <p className="mb-8 text-[0.98rem] leading-relaxed text-muted-foreground">
        Every published change to the documentation, newest first.
      </p>

      {byDay.size === 0 ? (
        <p className="rounded-xl border border-dashed px-5 py-4 text-sm text-muted-foreground">
          Nothing published yet — check back soon.
        </p>
      ) : (
        <div className="space-y-8">
          {[...byDay.entries()].map(([day, dayEntries]) => (
            <section key={day}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {day}
              </h2>
              <ul className="space-y-1.5">
                {dayEntries.map((e) => (
                  <li key={`${e.pageId}-${e.publishedAt.getTime()}`}>
                    <Link
                      href={e.isHome ? "/" : `/${e.path}`}
                      className="group flex items-center gap-2.5 rounded-lg border px-4 py-2.5 transition-colors hover:border-ring/50 hover:bg-muted/40"
                    >
                      <span
                        className={
                          e.isUpdate
                            ? "rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.68rem] font-semibold text-amber-700"
                            : "rounded-full bg-green-500/15 px-2 py-0.5 text-[0.68rem] font-semibold text-green-700"
                        }
                      >
                        {e.isUpdate ? "Updated" : "New"}
                      </span>
                      <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">
                        {e.title}
                      </span>
                      {e.internal && (
                        <Lock className="size-3 shrink-0 text-amber-600" />
                      )}
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                        /{e.isHome ? "" : e.path}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
