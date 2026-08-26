"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateGaIdAction } from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AnalyticsSettingsForm({ gaId }: { gaId: string }) {
  const [value, setValue] = useState(gaId);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          try {
            await updateGaIdAction({ value });
            toast.success(
              value.trim() === "" ? "Analytics disabled" : "Analytics saved",
            );
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Save failed");
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ga-id">Google Analytics</Label>
        <Input
          id="ga-id"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="G-XXXXXXXXXX — or paste the whole gtag snippet"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Paste your GA4 measurement ID (or the full snippet from the GA admin
          — the ID is extracted automatically). The tag loads on every public
          page. Leave empty to disable tracking.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save analytics"}
      </Button>
    </form>
  );
}
