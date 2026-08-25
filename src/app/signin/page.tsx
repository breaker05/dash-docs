import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { DashLogo } from "@/components/brand/dash-logo";

export const metadata = { title: "Sign in — Dash Docs" };

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.86z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.37-2.28V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const session = await auth();
  if (session?.user) redirect(callbackUrl ?? "/admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border bg-background p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mb-4 flex items-center justify-center gap-2.5">
              <DashLogo className="h-[17px] w-auto text-foreground" />
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-primary">
                Docs
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Sign in with your Google account to write and manage docs.
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm text-destructive">
              {error === "AccessDenied" ? (
                <>
                  <p className="font-medium">That account can’t sign in.</p>
                  <p className="mt-1 text-destructive/80">
                    Only @dashmarketing.io Google Workspace accounts have
                    access — make sure you picked your work account, not a
                    personal Gmail.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">Sign-in didn’t complete.</p>
                  <p className="mt-1 text-destructive/80">
                    Please try again. If it keeps failing, ask an admin to
                    check the Google OAuth configuration.
                  </p>
                </>
              )}
            </div>
          ) : null}

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: callbackUrl ?? "/admin" });
            }}
          >
            <Button type="submit" variant="outline" size="lg" className="w-full">
              <GoogleIcon /> Continue with Google
            </Button>
          </form>

          <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
            No account needed to read the docs —{" "}
            <Link href="/" className="text-primary hover:underline">
              browse them here
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
