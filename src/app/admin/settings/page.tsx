import { redirect } from "next/navigation";
import { db } from "@/db";
import { requireUser } from "@/server/auth-guards";
import {
  getSettings,
  PDF_FOOTER_KEY,
  PDF_HEADER_KEY,
  PDF_LOGO_KEY,
} from "@/server/settings";
import { PdfSettingsForm } from "@/components/admin/pdf-settings-form";

export default async function SettingsPage() {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/admin");

  const values = await getSettings(db, [
    PDF_HEADER_KEY,
    PDF_FOOTER_KEY,
    PDF_LOGO_KEY,
  ]);

  return (
    <div className="mx-auto max-w-2xl px-8 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-muted-foreground">
        Site-wide configuration. Admins only.
      </p>

      <h2 className="mb-1 text-lg font-semibold tracking-tight">
        PDF exports
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        Applied to PDF exports of pages that have “Default PDF header/footer”
        enabled (all pages by default — toggle per page in the editor).
        Use <code className="rounded bg-muted px-1 py-0.5 text-xs">|</code> to
        separate left/right sections and these tokens:{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          {"{title} {page} {pages} {date} {url}"}
        </code>
        . Leave a field empty to disable it.
      </p>
      <PdfSettingsForm
        headerText={values[PDF_HEADER_KEY] ?? ""}
        footerText={values[PDF_FOOTER_KEY] ?? ""}
        logoUrl={values[PDF_LOGO_KEY] ?? ""}
      />
    </div>
  );
}
