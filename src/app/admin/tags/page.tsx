import { db } from "@/db";
import { listTags } from "@/server/tags";
import { requireUser } from "@/server/auth-guards";
import { TagManager } from "@/components/admin/tag-manager";

export default async function TagsPage() {
  const user = await requireUser();
  const tags = await listTags(db);

  return (
    <div className="mx-auto max-w-2xl px-8 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">
        Feature tags
      </h1>
      <p className="mb-6 text-[0.95rem] leading-relaxed text-muted-foreground">
        Tag pages by feature to organize and filter them. Anyone can create
        and assign tags; renaming and deleting requires an admin.
      </p>
      <TagManager
        tags={tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug }))}
        isAdmin={user.role === "admin"}
      />
    </div>
  );
}
