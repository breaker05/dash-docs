import Markdoc, { type Node } from "@markdoc/markdoc";

/**
 * Strip markdown to searchable plain text: prose text plus code content
 * (so API paths like `/lead/submit` inside fences are searchable).
 */
export function markdownToPlainText(markdown: string): string {
  const ast = Markdoc.parse(markdown);
  const parts: string[] = [];
  const visit = (node: Node) => {
    if (
      node.type === "text" ||
      node.type === "code" ||
      node.type === "fence"
    ) {
      const content = node.attributes?.content;
      if (typeof content === "string") {
        parts.push(content);
        if (node.type !== "text") {
          // Postgres tokenizes URLs/paths as single lexemes; a
          // delimiter-split copy makes `/lead/submit` findable as
          // "lead submit"
          const split = content.replace(/[/_\-.:]+/g, " ");
          if (split !== content) parts.push(split);
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(ast);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
