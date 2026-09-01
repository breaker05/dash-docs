"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { adminDeleteChatAction } from "@/server/actions/admin-chats";
import { Button } from "@/components/ui/button";

/**
 * Delete a conversation from the admin review views. On the detail page pass
 * `redirectTo` to return to the list; in the list it just refreshes.
 */
export function DeleteChatButton({
  conversationId,
  redirectTo,
  variant = "icon",
}: {
  conversationId: string;
  redirectTo?: string;
  variant?: "icon" | "button";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      try {
        await adminDeleteChatAction(conversationId);
        toast.success("Conversation deleted");
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    });

  if (variant === "button") {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="text-destructive"
        disabled={pending}
        onClick={run}
      >
        <Trash2 className="size-3.5" /> Delete
      </Button>
    );
  }

  return (
    <button
      type="button"
      aria-label="Delete conversation"
      disabled={pending}
      onClick={run}
      className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
