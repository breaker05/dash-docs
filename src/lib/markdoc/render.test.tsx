import { describe, expect, it } from "vitest";
import Markdoc, { Tag } from "@markdoc/markdoc";
import { createMarkdocConfig } from "./config";
import { markdownToPlainText } from "./plain-text";

function transform(md: string) {
  return Markdoc.transform(Markdoc.parse(md), createMarkdocConfig());
}

function findTags(node: unknown, name: string): Tag[] {
  const found: Tag[] = [];
  const visit = (n: unknown) => {
    if (n && typeof n === "object" && "name" in n) {
      const tag = n as Tag;
      if (tag.name === name) found.push(tag);
      (tag.children ?? []).forEach(visit);
    } else if (Array.isArray(n)) {
      n.forEach(visit);
    }
  };
  visit(node);
  return found;
}

describe("markdoc config", () => {
  it("gives headings github-style slug ids, deduped", () => {
    const tree = transform("## Account Object\n\n## Account Object\n");
    const h2s = findTags(tree, "h2");
    expect(h2s.map((h) => h.attributes.id)).toEqual([
      "account-object",
      "account-object-1",
    ]);
  });

  it("renders fences via the Fence component with language", () => {
    const tree = transform('```json\n{"a":1}\n```\n');
    const fences = findTags(tree, "Fence");
    expect(fences).toHaveLength(1);
    expect(fences[0].attributes.language).toBe("json");
    expect(fences[0].attributes.content).toContain('"a"');
  });

  it("supports {% callout %} tags", () => {
    const tree = transform(
      '{% callout type="warning" title="Heads up" %}\nBe careful.\n{% /callout %}\n',
    );
    const callouts = findTags(tree, "Callout");
    expect(callouts).toHaveLength(1);
    expect(callouts[0].attributes.type).toBe("warning");
  });

  it("renders GFM tables from the legacy docs", () => {
    const tree = transform("| A | B |\n| --- | --- |\n| 1 | 2 |\n");
    expect(findTags(tree, "table")).toHaveLength(1);
  });
});

describe("markdownToPlainText", () => {
  it("keeps prose and code content, drops syntax", () => {
    const text = markdownToPlainText(
      "# Lead API\n\nSubmit via `POST /lead/submit`.\n\n```bash\ncurl https://api.dashmarketing.io\n```\n",
    );
    expect(text).toContain("Lead API");
    expect(text).toContain("/lead/submit");
    expect(text).toContain("api.dashmarketing.io");
    expect(text).not.toContain("```");
  });
});
