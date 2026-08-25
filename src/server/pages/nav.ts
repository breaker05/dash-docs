import type { Db } from "@/db";
import { getTree, type TreeNode } from "./tree";

export type NavNode = {
  id: string;
  title: string;
  path: string;
  isHome: boolean;
  icon: string | null;
  /** false → renders as a plain label (unpublished parent of published pages) */
  published: boolean;
  internal: boolean;
  children: NavNode[];
};

/**
 * The public sidebar tree: published pages the viewer may see, plus
 * unpublished/hidden ancestors kept as labels when they contain visible
 * descendants. Anonymous viewers never receive internal pages.
 */
export async function getPublicNav(
  db: Db,
  includeInternal: boolean,
): Promise<NavNode[]> {
  const tree = await getTree(db);

  const build = (nodes: TreeNode[]): NavNode[] =>
    nodes.flatMap((n) => {
      const visible =
        n.effectiveVisibility === "public" || includeInternal;
      const published = n.publishedContentMd !== null;
      const children = visible ? build(n.children) : [];
      if (!visible) return [];
      if (!published && children.length === 0) return [];
      return [
        {
          id: n.id,
          title: (published ? n.publishedTitle : null) ?? n.title,
          path: n.path,
          isHome: n.isHome,
          icon: n.icon,
          published,
          internal: n.effectiveVisibility === "internal",
          children,
        },
      ];
    });

  return build(tree);
}
