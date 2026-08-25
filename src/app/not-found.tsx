import Link from "next/link";
import { Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <p className="mb-2 font-mono text-sm font-medium text-primary">404</p>
        <h1 className="mb-3 text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mb-6 text-[0.95rem] leading-relaxed text-muted-foreground">
          This page doesn’t exist, isn’t published yet, or may be internal to
          the Dash Marketing team. Try searching for what you need:
        </p>
        <form action="/search" className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              placeholder="Search the docs…"
              autoFocus
              className="h-10 w-full rounded-lg border bg-muted/50 pl-9.5 pr-3 text-sm focus:border-ring focus:bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        </form>
        <div className="flex items-center justify-center gap-4 text-sm">
          <Link href="/" className="font-medium text-primary hover:underline">
            Docs home
          </Link>
          <span className="text-border">·</span>
          <Link
            href="/signin"
            className="text-muted-foreground hover:text-foreground"
          >
            Team sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
