// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Markdoc, { type RenderableTreeNode } from "@markdoc/markdoc";
import { roundtripMarkdown } from "./convert";

const LEGACY_DIR = "/Users/keenan/code/dash/dash-docs";
const LEGACY_FILES = [
  "index.md",
  "LEAD_SUBMISSION_API.md",
  "CUSTOMER_IMPORT_API.md",
];

/**
 * Semantic equivalence via Markdoc: two markdown strings are equivalent when
 * their transformed render trees match after whitespace normalization. This
 * is what actually matters — the public site renders through Markdoc.
 */
function renderTree(markdown: string): unknown {
  const ast = Markdoc.parse(markdown);
  return normalize(Markdoc.transform(ast));
}

function normalize(node: RenderableTreeNode | RenderableTreeNode[]): unknown {
  if (Array.isArray(node)) {
    return node.map(normalize).filter((n) => n !== null);
  }
  if (node === null || node === undefined) return null;
  if (typeof node === "string") {
    const collapsed = node.replace(/\s+/g, " ").trim();
    return collapsed === "" ? null : collapsed;
  }
  if (typeof node === "object" && "name" in node) {
    const tag = node as {
      name: string;
      attributes?: Record<string, unknown>;
      children?: RenderableTreeNode[];
    };
    return {
      name: tag.name,
      attributes: tag.attributes ?? {},
      children: (tag.children ?? [])
        .map(normalize)
        .filter((n) => n !== null),
    };
  }
  return node;
}

function stripFrontmatter(md: string): string {
  return md.replace(/^---\n[\s\S]*?\n---\n/, "");
}

describe("TipTap ↔ markdown round-trip fidelity (real legacy docs)", () => {
  for (const file of LEGACY_FILES) {
    it(`preserves rendered structure of ${file}`, () => {
      const raw = fs.readFileSync(path.join(LEGACY_DIR, file), "utf8");
      const original = stripFrontmatter(raw);
      const roundtripped = roundtripMarkdown(original);
      expect(renderTree(roundtripped)).toEqual(renderTree(original));
    });
  }

  it("round-trips core constructs losslessly", () => {
    const md = [
      "# Title",
      "",
      "Some **bold** and *italic* and `code` and a [link](https://example.com).",
      "",
      "| Col A | Col B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "```json",
      '{ "key": "value" }',
      "```",
      "",
      "- item one",
      "- item two",
      "",
      "1. first",
      "2. second",
      "",
      "> a quote",
    ].join("\n");
    const out = roundtripMarkdown(md);
    expect(renderTree(out)).toEqual(renderTree(md));
  });
});
