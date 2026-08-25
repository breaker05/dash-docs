import { NextResponse, type NextRequest } from "next/server";

// Optimistic gate only: checks that a session cookie exists. Real
// authorization happens in the admin layout and in every server action
// (src/server/auth-guards.ts) — this just keeps anonymous visitors from
// rendering admin shells.
export default function proxy(request: NextRequest) {
  const hasSession =
    request.cookies.has("authjs.session-token") ||
    request.cookies.has("__Secure-authjs.session-token");

  if (!hasSession) {
    const url = new URL("/signin", request.url);
    url.searchParams.set(
      "callbackUrl",
      request.nextUrl.pathname + request.nextUrl.search,
    );
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
