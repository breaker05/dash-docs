import { Node, mergeAttributes } from "@tiptap/core";
import type MarkdownIt from "markdown-it";

export const CALLOUT_TYPES = ["note", "warning", "success", "danger"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: { type?: CalloutType }) => ReturnType;
      unsetCallout: () => ReturnType;
      setCalloutType: (type: CalloutType) => ReturnType;
    };
  }
}

/**
 * WYSIWYG node for Markdoc's `{% callout %}` tag. Serialized back to the
 * exact tag syntax, so raw mode, the public renderer, and PDFs all keep
 * working from the same markdown.
 */
export const CalloutNode = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      type: { default: "note" },
      title: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-callout]",
        getAttrs: (el) => ({
          type: (el as HTMLElement).getAttribute("data-type") ?? "note",
          title: (el as HTMLElement).getAttribute("data-title"),
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-callout": "",
        "data-type": node.attrs.type,
        ...(node.attrs.title ? { "data-title": node.attrs.title } : {}),
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { type: "note", ...attrs }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
      setCalloutType:
        (type) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { type }),
    };
  },

  addStorage() {
    return {
      markdown: {
        serialize(
          state: {
            write(s: string): void;
            ensureNewLine(): void;
            renderContent(node: unknown): void;
            closeBlock(node: unknown): void;
          },
          node: { attrs: { type: string; title: string | null } },
        ) {
          const attrs = [` type="${node.attrs.type}"`];
          if (node.attrs.title) {
            attrs.push(
              ` title="${String(node.attrs.title).replaceAll('"', '\\"')}"`,
            );
          }
          state.write(`{% callout${attrs.join("")} %}\n\n`);
          state.renderContent(node);
          state.ensureNewLine();
          state.write("{% /callout %}");
          state.closeBlock(node);
        },
        parse: {
          setup(markdownit: MarkdownIt) {
            markdownit.use(calloutMarkdownItPlugin);
          },
        },
      },
    };
  },
});

const OPEN_RE = /^\{%\s*callout(\s[^%]*)?%\}\s*$/;
const CLOSE_RE = /^\{%\s*\/callout\s*%\}\s*$/;

/**
 * markdown-it block rule for `{% callout %}` … `{% /callout %}` containers.
 * tiptap-markdown parses via markdown-it → HTML → TipTap's parseHTML, so
 * this emits the same div[data-callout] shape renderHTML produces.
 */
function calloutMarkdownItPlugin(md: MarkdownIt) {
  md.block.ruler.before(
    "fence",
    "markdoc_callout",
    (state, startLine, endLine, silent) => {
      const lineText = (n: number) =>
        state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);

      const open = lineText(startLine).match(OPEN_RE);
      if (!open) return false;

      let closeLine = -1;
      for (let n = startLine + 1; n < endLine; n++) {
        if (CLOSE_RE.test(lineText(n))) {
          closeLine = n;
          break;
        }
      }
      if (closeLine === -1) return false;
      if (silent) return true;

      const params = open[1] ?? "";
      const type = params.match(/type="([^"]*)"/)?.[1] ?? "note";
      const title =
        params
          .match(/title="((?:[^"\\]|\\.)*)"/)?.[1]
          ?.replaceAll('\\"', '"') ?? null;

      const openToken = state.push("callout_open", "div", 1);
      openToken.attrs = [
        ["data-callout", ""],
        ["data-type", type],
      ];
      if (title) openToken.attrs.push(["data-title", title]);
      openToken.map = [startLine, closeLine];

      const oldLineMax = state.lineMax;
      state.lineMax = closeLine;
      state.md.block.tokenize(state, startLine + 1, closeLine);
      state.lineMax = oldLineMax;

      state.push("callout_close", "div", -1);
      state.line = closeLine + 1;
      return true;
    },
  );
}
