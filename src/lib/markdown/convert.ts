import { Editor } from "@tiptap/core";
import { editorExtensions } from "./editor-extensions";

/**
 * Serialize a TipTap doc to markdown. Leading non-breaking spaces (produced
 * by the PreserveIndent plugin when someone pastes indented text) are
 * re-encoded as &nbsp; entities: raw U+00A0 counts as trimmable whitespace
 * to markdown parsers, but the entity is decoded after block parsing, so
 * the indent survives Markdoc, the editor, and PDF rendering alike.
 */
export function serializeMarkdown(editor: Editor): string {
  return encodeLeadingNbsp(editor.storage.markdown.getMarkdown());
}

export function encodeLeadingNbsp(markdown: string): string {
  let inFence = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(/^\u00A0+/, (run) => "&nbsp;".repeat(run.length));
    })
    .join("\n");
}

/**
 * Parse markdown into a headless TipTap editor and serialize it back.
 * Requires a DOM (jsdom in tests, browser in the app) — TipTap has no
 * DOM-free parser.
 */
export function roundtripMarkdown(markdown: string): string {
  const editor = new Editor({
    extensions: editorExtensions,
    content: markdown,
  });
  try {
    return serializeMarkdown(editor);
  } finally {
    editor.destroy();
  }
}
