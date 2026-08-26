"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin, requireEditor } from "@/server/auth-guards";
import {
  PDF_FOOTER_KEY,
  PDF_HEADER_KEY,
  PDF_LOGO_KEY,
  setSetting,
} from "@/server/settings";
import { eq } from "drizzle-orm";
import { pages } from "@/db/schema";

export async function updatePdfSettingsAction(opts: {
  headerText: string;
  footerText: string;
}) {
  const user = await requireAdmin();
  await setSetting(db, {
    key: PDF_HEADER_KEY,
    value: opts.headerText,
    userId: user.id,
  });
  await setSetting(db, {
    key: PDF_FOOTER_KEY,
    value: opts.footerText,
    userId: user.id,
  });
  revalidatePath("/admin/settings");
}

export async function setPdfLogoAction(opts: { url: string }) {
  const user = await requireAdmin();
  if (opts.url.trim() !== "") {
    let parsed: URL;
    try {
      parsed = new URL(opts.url);
    } catch {
      throw new Error("Invalid logo URL");
    }
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname.endsWith(".public.blob.vercel-storage.com")
    ) {
      throw new Error("Logo must be an uploaded image");
    }
  }
  await setSetting(db, {
    key: PDF_LOGO_KEY,
    value: opts.url,
    userId: user.id,
  });
  revalidatePath("/admin/settings");
}

export async function setPdfChromeAction(opts: {
  pageId: string;
  pdfChrome: boolean;
}) {
  const user = await requireEditor();
  await db
    .update(pages)
    .set({ pdfChrome: opts.pdfChrome, updatedBy: user.id })
    .where(eq(pages.id, opts.pageId));
  revalidatePath(`/admin/pages/${opts.pageId}`);
}
