"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createPageAction } from "@/server/actions/pages";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function NewPageButton({
  parentId,
  parentTitle,
  parentPath,
  triggerLabel = "New page",
}: {
  parentId?: string | null;
  parentTitle?: string;
  parentPath?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, startTransition] = useTransition();
  const isSubPage = Boolean(parentId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" className="w-full" />}
      >
        <Plus className="size-4" /> {triggerLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isSubPage && parentTitle
              ? `New sub-page under “${parentTitle}”`
              : "New page"}
          </DialogTitle>
          <DialogDescription>
            {isSubPage
              ? `Created as a draft at /${parentPath ?? "…"}/<slug>. You can drag it elsewhere in the tree later.`
              : "Created as a draft at the top level. Drag it onto another page to nest it into a section."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            startTransition(async () => {
              try {
                await createPageAction({ title, parentId });
                setOpen(false);
                setTitle("");
              } catch (err) {
                // server action redirect() throws NEXT_REDIRECT — rethrow it
                if (
                  err instanceof Error &&
                  err.message.includes("NEXT_REDIRECT")
                ) {
                  throw err;
                }
                toast.error(
                  err instanceof Error ? err.message : "Could not create page",
                );
              }
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="new-page-title">Title</Label>
            <Input
              id="new-page-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isSubPage ? "Lead Submission API" : "Getting Started"}
              autoFocus
            />
          </div>
          <Button type="submit" disabled={pending || !title.trim()}>
            {pending ? "Creating…" : "Create page"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
