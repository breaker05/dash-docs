"use client";

import { useState, useTransition } from "react";
import { Database, Plug, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  createIntegrationAction,
  deleteIntegrationAction,
  setIntegrationEnabledAction,
  testIntegrationAction,
  updateIntegrationAction,
  type IntegrationTestResult,
} from "@/server/actions/integrations";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type IntegrationItem = {
  id: string;
  name: string;
  kind: "postgres" | "mcp";
  description: string;
  url: string | null;
  allowedTools: string[];
  enabled: boolean;
  secretHint: string;
  lastUsedAt: string | null;
};

const fieldLabel =
  "text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground";

function KindIcon({ kind }: { kind: IntegrationItem["kind"] }) {
  return kind === "postgres" ? (
    <Database className="size-4 shrink-0 text-muted-foreground" />
  ) : (
    <Plug className="size-4 shrink-0 text-muted-foreground" />
  );
}

export function Integrations({ items }: { items: IntegrationItem[] }) {
  const [adding, setAdding] = useState(items.length === 0);

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <ul className="space-y-3">
          {items.map((item) => (
            <IntegrationCard key={item.id} item={item} />
          ))}
        </ul>
      )}
      {adding ? (
        <AddIntegrationForm onDone={() => setAdding(false)} canCancel={items.length > 0} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add integration
        </Button>
      )}
    </div>
  );
}

function AddIntegrationForm({
  onDone,
  canCancel,
}: {
  onDone: () => void;
  canCancel: boolean;
}) {
  const [kind, setKind] = useState<IntegrationItem["kind"]>("postgres");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [secret, setSecret] = useState("");
  const [url, setUrl] = useState("");
  const [allowedTools, setAllowedTools] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4 rounded-lg border bg-muted/20 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await createIntegrationAction({
            name,
            kind,
            description,
            secret,
            url,
            allowedTools,
          });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Integration added — use Test to check it");
          onDone();
        });
      }}
    >
      <div className="flex gap-1.5">
        {(
          [
            ["postgres", "Postgres (read-only SQL)", Database],
            ["mcp", "MCP server", Plug],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
              kind === value
                ? "border-primary bg-primary/10 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="int-name" className={fieldLabel}>
          Name
        </Label>
        <Input
          id="int-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "postgres" ? "dash" : "linear"}
          className="h-8 font-mono text-xs"
          required
        />
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers, underscores. The assistant sees it as{" "}
          {kind === "postgres" ? (
            <code className="rounded bg-muted px-1">query_{name || "name"}</code>
          ) : (
            "the MCP server name"
          )}
          .
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="int-desc" className={fieldLabel}>
          What&rsquo;s in it
        </Label>
        <Textarea
          id="int-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder={
            kind === "postgres"
              ? "Dash platform production data: vendors, campaigns, leads, clients. Vendor names live in vendors.name."
              : "Our Linear workspace: issues, projects and cycles."
          }
          className="text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Shown to the assistant so it knows when to use this source. Mention
          key tables and columns to save it lookups.
        </p>
      </div>

      {kind === "postgres" ? (
        <div className="space-y-1.5">
          <Label htmlFor="int-secret" className={fieldLabel}>
            Read-only connection string
          </Label>
          <Input
            id="int-secret"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="postgresql://docs_reader:…@host/db?sslmode=require"
            className="h-8 font-mono text-xs"
            autoComplete="off"
            required
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Use a dedicated role with <strong>SELECT only</strong> on the
            tables the team chat should see (ideally on a read replica).
            Queries also run in a read-only transaction with a 15s timeout, but
            the role is the real safeguard. Stored encrypted.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="int-url" className={fieldLabel}>
              Server URL
            </Label>
            <Input
              id="int-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/mcp"
              className="h-8 font-mono text-xs"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="int-token" className={fieldLabel}>
              Bearer token
            </Label>
            <Input
              id="int-token"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className="h-8 font-mono text-xs"
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="int-tools" className={fieldLabel}>
              Allowed tools
            </Label>
            <Input
              id="int-tools"
              value={allowedTools}
              onChange={(e) => setAllowedTools(e.target.value)}
              placeholder="search_issues, get_issue"
              className="h-8 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. Leave empty to allow every tool the server
              exposes — not recommended for servers that can change things.
              Save, then use Test to list the server&rsquo;s tool names.
            </p>
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Add integration"}
        </Button>
        {canCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function IntegrationCard({ item }: { item: IntegrationItem }) {
  const [editing, setEditing] = useState(false);
  const [test, setTest] = useState<IntegrationTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = pending || testing;

  return (
    <li className="rounded-lg border">
      <div className="flex items-start gap-3 px-3 py-3">
        <KindIcon kind={item.kind} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            <span className="font-mono">{item.name}</span>
            <Badge variant="outline">
              {item.kind === "postgres" ? "Postgres" : "MCP"}
            </Badge>
            {!item.enabled && <Badge variant="secondary">disabled</Badge>}
            {item.kind === "mcp" && item.allowedTools.length === 0 && (
              <Badge className="bg-amber-500/15 text-amber-700">all tools</Badge>
            )}
          </p>
          {item.description && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {item.description}
            </p>
          )}
          <p className="break-all text-xs text-muted-foreground/80">
            {item.kind === "mcp" && <>{item.url} · </>}
            <span className="font-mono">{item.secretHint}</span>
            {item.kind === "mcp" && item.allowedTools.length > 0 && (
              <> · tools: {item.allowedTools.join(", ")}</>
            )}
            {" · "}
            {item.lastUsedAt
              ? `last used ${new Date(item.lastUsedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
              : "never used"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setTesting(true);
              try {
                setTest(await testIntegrationAction({ id: item.id }));
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing ? "Testing…" : "Test"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setEditing((v) => !v)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                try {
                  await setIntegrationEnabledAction({
                    id: item.id,
                    enabled: !item.enabled,
                  });
                } catch {
                  toast.error("Update failed");
                }
              })
            }
          >
            {item.enabled ? "Disable" : "Enable"}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={busy}
                />
              }
            >
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{item.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  The team chat will no longer be able to use this source, and
                  the stored credential is discarded. Past chats keep their
                  query log.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() =>
                    startTransition(async () => {
                      try {
                        await deleteIntegrationAction({ id: item.id });
                        toast.success("Integration deleted");
                      } catch {
                        toast.error("Delete failed");
                      }
                    })
                  }
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {test && <TestResult result={test} />}
      {editing && (
        <EditIntegrationForm item={item} onDone={() => setEditing(false)} />
      )}
    </li>
  );
}

function TestResult({ result }: { result: IntegrationTestResult }) {
  if (!result.ok) {
    return (
      <p className="border-t bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
        Connection failed: {result.error}
      </p>
    );
  }
  if (result.kind === "mcp") {
    return (
      <div className="border-t bg-green-500/5 px-3 py-2.5 text-xs leading-relaxed">
        <p className="flex items-center gap-1.5 font-medium text-green-700">
          <ShieldCheck className="size-3.5" /> Connected to {result.serverName}
        </p>
        <p className="mt-1 text-muted-foreground">
          {result.tools.length} tools:{" "}
          <span className="font-mono">{result.tools.join(", ") || "none"}</span>
        </p>
      </div>
    );
  }
  const safe = !result.superuser && result.writableTables === 0;
  return (
    <div
      className={cn(
        "border-t px-3 py-2.5 text-xs leading-relaxed",
        safe ? "bg-green-500/5" : "bg-amber-500/10",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 font-medium",
          safe ? "text-green-700" : "text-amber-700",
        )}
      >
        {safe ? (
          <ShieldCheck className="size-3.5" />
        ) : (
          <ShieldAlert className="size-3.5" />
        )}
        {safe
          ? "Connected — this role is read-only"
          : result.superuser
            ? "Connected as a SUPERUSER — use a read-only role instead"
            : `Connected, but this role can write to ${result.writableTables} table${result.writableTables === 1 ? "" : "s"} — use a SELECT-only role`}
      </p>
      <p className="mt-1 text-muted-foreground">
        Role <span className="font-mono">{result.currentUser}</span> on{" "}
        <span className="font-mono">{result.database}</span> · can read{" "}
        {result.readableTables} table{result.readableTables === 1 ? "" : "s"}.
        Queries always run read-only regardless.
      </p>
    </div>
  );
}

function EditIntegrationForm({
  item,
  onDone,
}: {
  item: IntegrationItem;
  onDone: () => void;
}) {
  const [description, setDescription] = useState(item.description);
  const [url, setUrl] = useState(item.url ?? "");
  const [allowedTools, setAllowedTools] = useState(item.allowedTools.join(", "));
  const [secret, setSecret] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3 border-t bg-muted/20 px-3 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateIntegrationAction({
            id: item.id,
            description,
            ...(item.kind === "mcp" ? { url, allowedTools } : {}),
            secret,
          });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Integration updated");
          onDone();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label className={fieldLabel}>What&rsquo;s in it</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="text-sm"
        />
      </div>
      {item.kind === "mcp" && (
        <>
          <div className="space-y-1.5">
            <Label className={fieldLabel}>Server URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className={fieldLabel}>Allowed tools</Label>
            <Input
              value={allowedTools}
              onChange={(e) => setAllowedTools(e.target.value)}
              placeholder="empty = all tools"
              className="h-8 font-mono text-xs"
            />
          </div>
        </>
      )}
      <div className="space-y-1.5">
        <Label className={fieldLabel}>
          {item.kind === "postgres" ? "New connection string" : "New bearer token"}
        </Label>
        <Input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="leave blank to keep the current one"
          className="h-8 font-mono text-xs"
          autoComplete="off"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
