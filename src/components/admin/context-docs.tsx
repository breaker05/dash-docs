"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Globe, Lock, Paperclip } from "lucide-react";
import { toast } from "sonner";
import {
  deleteContextDocAction,
  setContextDocAudienceAction,
  setContextDocEnabledAction,
} from "@/server/actions/context-docs";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type ContextDocRow = {
  id: string;
  name: string;
  filename: string;
  bytes: number;
  audience: "public" | "internal";
  enabled: boolean;
  chunkCount: number;
  updatedAt: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContextDocs({ docs }: { docs: ContextDocRow[] }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/context-upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast.success(
        `Added “${file.name}” (${data.chunkCount} searchable ${data.chunkCount === 1 ? "chunk" : "chunks"})`,
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        disabled={uploading}
        onClick={() => fileInput.current?.click()}
        className="flex w-full items-center gap-3 rounded-lg border border-dashed bg-background px-4 py-3.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <FileUp className="size-4 shrink-0" />
        {uploading
          ? "Uploading…"
          : "Upload a file — .json .yaml .md .txt .csv .xml, max 2MB (re-upload the same name to replace)"}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,.yaml,.yml,.md,.txt,.csv,.xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {docs.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Nothing here yet. Upload reference files like an OpenAPI/Swagger
          spec — they feed AI answers without ever appearing as pages.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-3 py-2.5">
              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {doc.name}
                  {!doc.enabled && (
                    <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-normal text-muted-foreground">
                      disabled
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {doc.filename} · {formatBytes(doc.bytes)} · {doc.chunkCount}{" "}
                  chunks · updated{" "}
                  {new Date(doc.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <Select
                value={doc.audience}
                disabled={pending}
                onValueChange={(v) =>
                  startTransition(async () => {
                    try {
                      await setContextDocAudienceAction({
                        id: doc.id,
                        audience: v as "public" | "internal",
                      });
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Update failed",
                      );
                    }
                  })
                }
              >
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">
                    <span className="flex items-center gap-2">
                      <Lock className="size-3.5" /> Team answers only
                    </span>
                  </SelectItem>
                  <SelectItem value="public">
                    <span className="flex items-center gap-2">
                      <Globe className="size-3.5" /> Public answers
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await setContextDocEnabledAction({
                        id: doc.id,
                        enabled: !doc.enabled,
                      });
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Update failed",
                      );
                    }
                  })
                }
              >
                {doc.enabled ? "Disable" : "Enable"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      disabled={pending}
                    />
                  }
                >
                  Delete
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{doc.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      AI answers will no longer draw on this file, and MCP
                      clients lose access to it. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await deleteContextDocAction({ id: doc.id });
                            toast.success(`Deleted “${doc.name}”`);
                          } catch (err) {
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "Delete failed",
                            );
                          }
                        })
                      }
                    >
                      Delete file
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
