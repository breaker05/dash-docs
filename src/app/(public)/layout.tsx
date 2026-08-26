import Link from "next/link";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Search, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { db } from "@/db";
import { getPublicNav } from "@/server/pages/nav";
import { GA_ID_KEY, getSettings } from "@/server/settings";
import { PublicNav } from "@/components/public/nav";
import { MobileNav } from "@/components/public/mobile-nav";
import { DashLogo } from "@/components/brand/dash-logo";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const [nav, settings] = await Promise.all([
    getPublicNav(db, Boolean(session?.user)),
    getSettings(db, [GA_ID_KEY]),
  ]);
  const gaId = settings[GA_ID_KEY];

  return (
    <div className="min-h-screen">
      {gaId && <GoogleAnalytics gaId={gaId} />}
      <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-4 px-4 md:gap-6 md:px-5 lg:px-8">
          <MobileNav nodes={nav} />
          <Link href="/" className="flex shrink-0 items-center gap-2.5">
            <DashLogo className="h-[15px] w-auto text-foreground" />
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-primary">
              Docs
            </span>
          </Link>
          <form action="/search" className="ml-auto hidden w-full max-w-sm sm:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                name="q"
                placeholder="Search the docs…"
                className="h-9.5 w-full rounded-lg border bg-muted/50 pl-9.5 pr-3 text-sm transition-colors focus:border-ring focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </form>
          <Link
            href="/search"
            aria-label="Search the docs"
            className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden"
          >
            <Search className="size-4" />
          </Link>
          {session?.user ? (
            <Button nativeButton={false} render={<Link href="/admin" />}>
              Edit docs
            </Button>
          ) : (
            <Link
              href="/signin"
              className="shrink-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="hidden sm:inline">Team sign in</span>
              <span className="sm:hidden">Sign in</span>
            </Link>
          )}
        </div>
      </header>
      <div className="mx-auto flex max-w-screen-2xl gap-10 px-5 lg:px-8">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 shrink-0 overflow-y-auto py-8 pr-2 md:block">
          {nav.length > 0 ? (
            <PublicNav nodes={nav} />
          ) : (
            <p className="px-2.5 text-sm text-muted-foreground">
              Published pages will appear here.
            </p>
          )}
        </aside>
        <main className="min-w-0 flex-1 py-10">{children}</main>
      </div>
      <Toaster />
      <footer className="border-t">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted-foreground lg:px-8">
          <p>© {new Date().getFullYear()} Dash Marketing</p>
          <div className="flex items-center gap-5">
            <Link
              href="/mcp"
              className="flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Sparkles className="size-3.5 text-primary" /> Connect an AI
              assistant
            </Link>
            <Link href="/tags" className="transition-colors hover:text-foreground">
              Browse by tag
            </Link>
            <a
              href="https://www.dashmarketing.io"
              className="transition-colors hover:text-foreground"
            >
              dashmarketing.io
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
