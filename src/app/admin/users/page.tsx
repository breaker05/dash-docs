import { redirect } from "next/navigation";
import Image from "next/image";
import { db } from "@/db";
import { listUsers } from "@/server/users";
import { requireUser } from "@/server/auth-guards";
import { RoleSelect } from "@/components/admin/role-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function UsersPage() {
  const me = await requireUser();
  if (me.role !== "admin") redirect("/admin");

  const users = await listUsers(db);

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Team</h1>
      <p className="mb-4 text-[0.95rem] leading-relaxed text-muted-foreground">
        There are no invites to send — anyone who signs in with a{" "}
        <strong>@dashmarketing.io</strong> Google account appears here
        automatically as an <strong>editor</strong> (write and save drafts).
        Promote someone to <strong>admin</strong> to let them publish, delete
        pages, and manage this list.
      </p>
      <p className="mb-6 rounded-lg border border-dashed px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
        Safety net: you can’t demote the last remaining admin, so the team can
        never lock itself out of publishing.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead className="w-36">Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  {user.image ? (
                    <Image
                      src={user.image}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded-full"
                    />
                  ) : (
                    <div className="size-7 rounded-full bg-muted" />
                  )}
                  <div>
                    <p className="font-medium">{user.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {user.createdAt.toLocaleDateString()}
              </TableCell>
              <TableCell>
                <RoleSelect
                  userId={user.id}
                  role={user.role}
                  isSelf={user.id === me.id}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
