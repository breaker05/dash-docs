"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import {
  createApiKeyAction,
  revokeApiKeyAction,
} from "@/server/actions/api-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function McpKeys({ keys }: { keys: ApiKeyRow[] }) {
  const [name, setName] = useState("");
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() === "") return;
          startTransition(async () => {
            try {
              const { token } = await createApiKeyAction({ name });
              setFreshToken(token);
              setCopied(false);
              setName("");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Create failed",
              );
            }
          });
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name, e.g. “Mapping assistant”"
          className="h-9"
        />
        <Button type="submit" disabled={pending || name.trim() === ""}>
          Create key
        </Button>
      </form>

      {freshToken && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">
            Copy this key now — it won’t be shown again.
          </p>
          <div className="flex items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 font-mono text-xs">
              {freshToken}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(freshToken);
                setCopied(true);
                toast.success("Key copied");
              }}
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          No keys yet. Create one and pass it as{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            Authorization: Bearer …
          </code>{" "}
          when connecting to the MCP server — that connection can then read
          internal pages.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
              <KeyRound className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {k.name}
                  {k.revokedAt && (
                    <span className="ml-2 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[0.65rem] font-normal text-red-700">
                      revoked
                    </span>
                  )}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {k.keyPrefix}…{" · "}
                  {k.lastUsedAt
                    ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                    : "never used"}
                </p>
              </div>
              {!k.revokedAt && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await revokeApiKeyAction({ id: k.id });
                        toast.success(`Revoked “${k.name}”`);
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Revoke failed",
                        );
                      }
                    })
                  }
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
