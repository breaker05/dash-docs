import { Tag, type Config, type RenderableTreeNode } from "@markdoc/markdoc";
import GithubSlugger from "github-slugger";

function collectText(nodes: RenderableTreeNode[]): string {
  const parts: string[] = [];
  const visit = (n: RenderableTreeNode) => {
    if (typeof n === "string" || typeof n === "number") {
      parts.push(String(n));
    } else if (n && typeof n === "object" && "children" in n) {
      for (const child of (n as Tag).children ?? []) visit(child);
    }
  };
  nodes.forEach(visit);
  return parts.join(" ");
}

/**
 * Per-render config (the heading slugger is stateful so repeated heading
 * texts get -1/-2 suffixes exactly like GitHub — preserving the legacy
 * docs' #anchor links).
 */
export function createMarkdocConfig(): Config {
  const slugger = new GithubSlugger();
  return {
    nodes: {
      heading: {
        children: ["inline"],
        attributes: {
          id: { type: String },
          level: { type: Number, required: true, default: 1 },
        },
        transform(node, config) {
          const attributes = node.transformAttributes(config);
          const children = node.transformChildren(config);
          const id =
            typeof attributes.id === "string"
              ? attributes.id
              : slugger.slug(collectText(children));
          return new Tag(
            `h${node.attributes.level}`,
            { ...attributes, id },
            children,
          );
        },
      },
      fence: {
        render: "Fence",
        attributes: {
          content: { type: String },
          language: { type: String },
        },
      },
    },
    tags: {
      callout: {
        render: "Callout",
        attributes: {
          type: {
            type: String,
            default: "note",
            matches: ["note", "warning", "success", "danger"],
          },
          title: { type: String },
        },
      },
    },
  };
}
