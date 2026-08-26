// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import Markdoc from "@markdoc/markdoc";
import { editorExtensions } from "./editor-extensions";
import { roundtripMarkdown, serializeMarkdown } from "./convert";

const NBSP = "\u00A0";

describe("indented text survives editor → markdown → Markdoc", () => {
  it("converts pasted leading spaces to &nbsp; entities in the markdown", () => {
    const editor = new Editor({ extensions: editorExtensions, content: "" });
    try {
      // what pasting diagram-style text produces: paragraphs whose text
      // starts with real spaces
      editor.commands.insertContent([
        { type: "paragraph", content: [{ type: "text", text: "Organization (you)" }] },
        { type: "paragraph", content: [{ type: "text", text: "   └── Client (theirs)" }] },
      ]);
      const md = serializeMarkdown(editor);
      expect(md).toContain("&nbsp;&nbsp;&nbsp;└── Client (theirs)");
      expect(md).not.toMatch(/\n +└/);
    } finally {
      editor.destroy();
    }
  });

  it("round-trips &nbsp;-indented markdown unchanged", () => {
    const md = `Organization (you)

&nbsp;&nbsp;&nbsp;└── Client (theirs)`;
    const once = roundtripMarkdown(md);
    expect(once).toContain("&nbsp;&nbsp;&nbsp;└── Client (theirs)");
    expect(roundtripMarkdown(once)).toBe(once);
  });

  it("leaves code fences alone", () => {
    const md = "```\n    indented code\n```";
    const out = roundtripMarkdown(md);
    expect(out).toContain("    indented code");
    expect(out).not.toContain("&nbsp;");
  });

  it("markdoc renders &nbsp; indentation at line start", () => {
    const tree = Markdoc.transform(
      Markdoc.parse("&nbsp;&nbsp;&nbsp;└── Client (theirs)"),
    );
    expect(JSON.stringify(tree)).toContain(`${NBSP.repeat(3)}└── Client`);
  });
});
