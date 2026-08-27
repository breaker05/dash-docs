"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, PauseCircle } from "lucide-react";
import { toast } from "sonner";
import {
  setAskEnabledAction,
  updateAnthropicKeyAction,
} from "@/server/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function EnableToggle({
  enabled,
  pending,
  onToggle,
}: {
  enabled: boolean;
  pending: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={enabled}
        disabled={pending}
        onChange={(e) => onToggle(e.target.checked)}
        className="size-4 accent-[var(--primary)]"
      />
      Chat enabled on the public site
      {!enabled && (
        <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.7rem] font-medium text-amber-700">
          <PauseCircle className="size-3" /> temporarily off — key kept
        </span>
      )}
    </label>
  );
}

export function AiSettingsForm({
  configured,
  source,
  enabled,
}: {
  configured: boolean;
  /** where the active key comes from */
  source: "env" | "settings" | null;
  enabled: boolean;
}) {
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState(!configured);
  const [pending, startTransition] = useTransition();

  const toggle = (next: boolean) =>
    startTransition(async () => {
      try {
        await setAskEnabledAction({ enabled: next });
        toast.success(next ? "Ask AI enabled" : "Ask AI paused — key kept");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      }
    });

  if (source === "env") {
    return (
      <div>
        <p className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 shrink-0 text-green-600" />
          The API key comes from the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            ANTHROPIC_API_KEY
          </code>{" "}
          environment variable, which takes precedence — manage the key in
          your deployment settings.
        </p>
        <EnableToggle enabled={enabled} pending={pending} onToggle={toggle} />
      </div>
    );
  }

  if (configured && !editing) {
    return (
      <div>
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <CheckCircle2 className="size-4 shrink-0 text-green-600" />
          <p className="flex-1 text-sm text-muted-foreground">
            An API key is saved{enabled ? " — Ask AI is live on the public site" : ""}.
          </p>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setEditing(true)}
            >
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  try {
                    await updateAnthropicKeyAction({ value: "" });
                    setEditing(true);
                    toast.success("Key removed — Ask AI is now disabled");
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
        <EnableToggle enabled={enabled} pending={pending} onToggle={toggle} />
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          try {
            await updateAnthropicKeyAction({ value });
            setValue("");
            setEditing(false);
            toast.success("Key saved — Ask AI is live");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Save failed");
          }
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="anthropic-key">Anthropic API key</Label>
        <Input
          id="anthropic-key"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-ant-…"
          autoComplete="off"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Create one at console.anthropic.com → API Keys. The key is stored
          in the database and never shown again after saving — for
          production, the{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            ANTHROPIC_API_KEY
          </code>{" "}
          environment variable is the more standard home and overrides this.
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button type="submit" disabled={pending || value.trim() === ""}>
          {pending ? "Saving…" : "Save key"}
        </Button>
        {configured && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
