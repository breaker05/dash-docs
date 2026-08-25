"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createTagAction,
  deleteTagAction,
  renameTagAction,
} from "@/server/actions/tags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TagRow = { id: string; name: string; slug: string };

export function TagManager({
  tags,
  isAdmin,
}: {
  tags: TagRow[];
  isAdmin: boolean;
}) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          startTransition(async () => {
            try {
              await createTagAction({ name: newName });
              setNewName("");
              toast.success("Tag created");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Could not create tag",
              );
            }
          });
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag name (e.g. Lead API)"
        />
        <Button type="submit" disabled={pending || !newName.trim()}>
          Add tag
        </Button>
      </form>

      {tags.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="mb-1 text-sm font-medium">No tags yet</p>
          <p className="mx-auto max-w-sm text-[0.85rem] leading-relaxed text-muted-foreground">
            Create tags for product features (e.g. “Lead API”, “Webhooks”) and
            attach them to pages from the editor’s side panel. Tags make the
            admin view filterable as the docs grow.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tag</TableHead>
              <TableHead>Slug</TableHead>
              {isAdmin && <TableHead className="w-24" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell>
                  {editing?.id === tag.id ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        startTransition(async () => {
                          try {
                            await renameTagAction({
                              id: tag.id,
                              name: editing.name,
                            });
                            setEditing(null);
                          } catch (err) {
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "Rename failed",
                            );
                          }
                        });
                      }}
                    >
                      <Input
                        value={editing.name}
                        onChange={(e) =>
                          setEditing({ id: tag.id, name: e.target.value })
                        }
                        className="h-8"
                        autoFocus
                      />
                      <Button size="sm" type="submit" disabled={pending}>
                        Save
                      </Button>
                    </form>
                  ) : (
                    <Badge variant="secondary">{tag.name}</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {tag.slug}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Rename ${tag.name}`}
                        onClick={() =>
                          setEditing({ id: tag.id, name: tag.name })
                        }
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Delete ${tag.name}`}
                        className="text-destructive"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            try {
                              await deleteTagAction({ id: tag.id });
                              toast.success("Tag deleted");
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
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
