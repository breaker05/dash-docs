import { db } from "@/db";
import { requireUser } from "@/server/auth-guards";
import { listAssetsWithUsage } from "@/server/assets";
import { AssetLibrary } from "@/components/admin/asset-library";

export const metadata = { title: "Images — Dash Docs" };

export default async function AssetsPage() {
  const me = await requireUser();
  const assets = await listAssetsWithUsage(db);

  return (
    <div className="mx-auto max-w-5xl px-8 py-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Images</h1>
      <p className="mb-8 text-[0.95rem] leading-relaxed text-muted-foreground">
        Every image uploaded through the editor, MCP or the API, and the pages
        that use it. “Unused” images aren’t referenced by any page draft,
        published page or setting, so they’re safe to delete.
      </p>
      <AssetLibrary
        canDelete={me.role === "admin"}
        assets={assets.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
