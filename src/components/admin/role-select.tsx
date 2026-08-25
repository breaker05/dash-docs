"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setUserRoleAction } from "@/server/actions/users";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RoleSelect({
  userId,
  role,
  isSelf,
}: {
  userId: string;
  role: "editor" | "admin";
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(next) => {
        if (next === role) return;
        if (isSelf && next === "editor") {
          const ok = confirm(
            "You are demoting yourself — you will lose admin access. Continue?",
          );
          if (!ok) return;
        }
        startTransition(async () => {
          try {
            await setUserRoleAction({
              userId,
              role: next as "editor" | "admin",
            });
            toast.success("Role updated");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Update failed");
          }
        });
      }}
    >
      <SelectTrigger className="h-8">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="editor">Editor</SelectItem>
        <SelectItem value="admin">Admin</SelectItem>
      </SelectContent>
    </Select>
  );
}
