import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Tag } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { getTagPages } from "@/server/tags";
import { PageIcon } from "@/lib/page-icons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const session = await auth();
  const result = await getTagPages(db, slug, Boolean(session?.user));
  if (!result) return {};
  return { title: `${result.tag.name} — Dash Marketing Docs` };
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const result = await getTagPages(db, slug, Boolean(session?.user));
  if (!result) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/tags"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All tags
      </Link>
      <h1 className="mb-1 flex items-center gap-2.5 text-[1.6rem] font-bold tracking-tight">
        <Tag className="size-5 text-primary" />
        {result.tag.name}
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        {result.pages.length} page{result.pages.length === 1 ? "" : "s"} tagged
        with “{result.tag.name}”.
      </p>
      <ul className="space-y-4">
        {result.pages.map((page) => (
          <li key={page.id} className="rounded-xl border p-4 transition-colors hover:border-ring/40">
            <Link
              href={`/${page.path}`}
              className="flex items-center gap-2 text-[1.05rem] font-semibold text-primary hover:underline"
            >
              <PageIcon
                name={page.icon}
                className="size-4 text-muted-foreground"
              />
              {page.title}
              {page.internal && <Lock className="size-3.5 text-amber-600" />}
            </Link>
            <p className="text-[0.8rem] text-muted-foreground">/{page.path}</p>
            {page.excerpt && (
              <p className="mt-1.5 text-[0.9rem] leading-relaxed text-foreground/75">
                {page.excerpt}…
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
