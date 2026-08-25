"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { restoreRevisionAction } from "@/server/actions/revisions";
import { Button } from "@/components/ui/button";

export function RestoreButton({
  pageId,
  revisionId,
}: {
  pageId: string;
  revisionId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await restoreRevisionAction({ pageId, revisionId });
            toast.success("Version restored into the draft");
            router.push(`/admin/pages/${pageId}`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Restore failed");
          }
        })
      }
    >
      {pending ? "Restoring…" : "Restore this version"}
    </Button>
  );
}
