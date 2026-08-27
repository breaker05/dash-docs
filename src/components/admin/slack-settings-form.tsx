"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  sendTestDigestAction,
  updateSlackWebhookAction,
} from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SlackSettingsForm({ webhookUrl }: { webhookUrl: string }) {
  const [value, setValue] = useState(webhookUrl);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          try {
            await updateSlackWebhookAction({ url: value });
            toast.success(
              value.trim() === "" ? "Digest disabled" : "Webhook saved",
            );
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Save failed");
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="slack-webhook">Slack webhook URL</Label>
        <Input
          id="slack-webhook"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://hooks.slack.com/services/…"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          A weekly “what changed in the docs” message posts here every Monday
          morning. Leave empty to disable.
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save webhook"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending || value.trim() === ""}
          onClick={() =>
            startTransition(async () => {
              try {
                const res = await sendTestDigestAction();
                toast.success(
                  `Test digest sent (${res.count} ${res.count === 1 ? "entry" : "entries"} from the last 7 days)`,
                );
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Send failed",
                );
              }
            })
          }
        >
          Send test digest
        </Button>
      </div>
    </form>
  );
}
