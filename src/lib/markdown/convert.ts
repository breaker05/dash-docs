import { Editor } from "@tiptap/core";
import { editorExtensions } from "./editor-extensions";

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
    return editor.storage.markdown.getMarkdown();
  } finally {
    editor.destroy();
  }
}
