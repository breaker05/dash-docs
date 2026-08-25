"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updatePdfSettingsAction } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PdfSettingsForm({
  headerText,
  footerText,
}: {
  headerText: string;
  footerText: string;
}) {
  const [header, setHeader] = useState(headerText);
  const [footer, setFooter] = useState(footerText);
  const [pending, startTransition] = useTransition();

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
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
