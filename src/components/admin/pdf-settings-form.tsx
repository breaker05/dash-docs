"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import {
  setPdfLogoAction,
  updatePdfSettingsAction,
} from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PdfSettingsForm({
  headerText,
  footerText,
  logoUrl,
}: {
  headerText: string;
  footerText: string;
  logoUrl: string;
}) {
  const [header, setHeader] = useState(headerText);
  const [footer, setFooter] = useState(footerText);
  const [logo, setLogo] = useState(logoUrl);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      await setPdfLogoAction({ url: data.url });
      setLogo(data.url);
      toast.success("Logo saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          try {
            await updatePdfSettingsAction({
              headerText: header,
              footerText: footer,
            });
            toast.success("PDF settings saved");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Save failed");
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="pdf-header">Header</Label>
        <Input
          id="pdf-header"
          value={header}
          onChange={(e) => setHeader(e.target.value)}
          placeholder="Dash Marketing — Confidential | {date}"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Empty = no header (more room for content).
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pdf-footer">Footer</Label>
        <Input
          id="pdf-footer"
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          placeholder="{title} — Dash Marketing Docs | Page {page} of {pages}"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Empty = the standard footer (title + page numbers).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Title-page logo</Label>
        {logo ? (
          <div className="flex items-center gap-4 rounded-lg border bg-background p-3">
            <Image
              src={logo}
              alt="PDF title-page logo"
              width={180}
              height={56}
              className="h-14 w-45 object-contain object-left"
            />
            <div className="ml-auto flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploading || pending}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? "Uploading…" : "Replace"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={uploading || pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await setPdfLogoAction({ url: "" });
                      setLogo("");
                      toast.success("Logo removed");
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Remove failed",
                      );
                    }
                  })
                }
              >
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed bg-background px-4 py-3.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            <ImagePlus className="size-4 shrink-0" />
            {uploading ? "Uploading…" : "Upload a logo (PNG or SVG works best)"}
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadLogo(file);
          }}
        />
        <p className="text-xs text-muted-foreground">
          With a logo set, exports that use the default header/footer get a
          title page — logo above the page title — and the content starts on
          page&nbsp;2. Remove the logo to go back to single-page-flow exports.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
