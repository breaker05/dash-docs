import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

/**
 * Markdown strips leading spaces on paragraph lines, but the WYSIWYG renders
 * them (ProseMirror uses white-space: pre-wrap) — so pasted diagram-style
 * text looks indented in the editor and then collapses left on the public
 * site. This plugin rewrites leading regular spaces in text lines to
 * non-breaking spaces, which markdown preserves, so the editor, the public
 * renderer, and PDFs all agree. Code blocks keep real spaces.
 */
export const PreserveIndent = Extension.create({
  name: "preserveIndent",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const tr = newState.tr;
          let modified = false;
          newState.doc.descendants((node, pos) => {
            if (!node.isTextblock) return true;
            if (node.type.name === "codeBlock") return false;
            // a "line" starts at the block start and after each hard break
            let lineStart = true;
            node.forEach((child, offset) => {
              if (child.isText && lineStart) {
                const run = child.text?.match(/^ +/);
                if (run) {
                  const from = pos + 1 + offset;
                  // same-length replacement keeps later positions valid
                  tr.insertText(
                    "\u00A0".repeat(run[0].length),
                    from,
                    from + run[0].length,
                  );
                  modified = true;
                }
              }
              lineStart = child.type.name === "hardBreak";
            });
            return false;
          });
          return modified ? tr : null;
        },
      }),
    ];
  },
});
