import Markdoc, { Tag, type Config } from "@markdoc/markdoc";
import GithubSlugger from "github-slugger";

/**
 * PDF-specific Markdoc config: everything renders to plain HTML tags so the
 * document can be produced with Markdoc.renderers.html in-process — no React,
 * no shiki (plain styled <pre> blocks in PDFs).
 */
function createPdfConfig(): Config {
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
          const children = node.transformChildren(config);
          const text = children
            .map((c) => (typeof c === "string" ? c : ""))
            .join(" ");
          return new Tag(
            `h${node.attributes.level}`,
            { id: slugger.slug(text) },
            children,
          );
        },
      },
      fence: {
        attributes: { content: { type: String }, language: { type: String } },
        transform(node) {
          return new Tag(
            "pre",
            { class: "fence" },
            [new Tag("code", {}, [String(node.attributes.content ?? "")])],
          );
        },
      },
    },
    tags: {
      callout: {
        attributes: {
          type: { type: String, default: "note" },
          title: { type: String },
        },
        transform(node, config) {
          const children = node.transformChildren(config);
          const title = node.attributes.title
            ? [
                new Tag("p", { class: "callout-title" }, [
                  String(node.attributes.title),
                ]),
              ]
            : [];
          return new Tag(
            "aside",
            { class: `callout callout-${node.attributes.type}` },
            [...title, ...children],
          );
        },
      },
    },
  };
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 11px; line-height: 1.55; color: #1a1a1a; margin: 0;
  }
  h1 { font-size: 22px; margin: 0 0 12px; }
  h2 { font-size: 16px; margin: 20px 0 8px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
  h3 { font-size: 13px; margin: 16px 0 6px; }
  h4, h5, h6 { font-size: 11px; margin: 12px 0 4px; }
  h1, h2, h3, h4 { break-after: avoid; }
  p { margin: 6px 0; }
  a { color: #1d4ed8; text-decoration: none; }
  code {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 10px; background: #f4f4f5; border-radius: 3px; padding: 1px 4px;
  }
  pre.fence {
    background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 6px;
    padding: 10px 12px; margin: 8px 0; break-inside: avoid;
    white-space: pre-wrap; word-break: break-word;
  }
  pre.fence code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #d4d4d8; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; font-weight: 600; }
  blockquote { border-left: 3px solid #d4d4d8; margin: 8px 0; padding: 2px 12px; color: #52525b; }
  img { max-width: 100%; }
  ul, ol { margin: 6px 0; padding-left: 22px; }
  li { margin: 2px 0; }
  hr { border: none; border-top: 1px solid #e5e5e5; margin: 14px 0; }
  aside.callout {
    border: 1px solid; border-radius: 6px; padding: 10px 12px; margin: 10px 0;
    break-inside: avoid;
  }
  aside.callout-note { border-color: #bfdbfe; background: #eff6ff; }
  aside.callout-warning { border-color: #fde68a; background: #fffbeb; }
  aside.callout-success { border-color: #bbf7d0; background: #f0fdf4; }
  aside.callout-danger { border-color: #fecaca; background: #fef2f2; }
  .callout-title { font-weight: 600; margin: 0 0 4px; }
`;

/** Build a complete standalone HTML document for a page, ready for print. */
export function renderPdfHtml(opts: {
  title: string;
  markdown: string;
}): string {
  const ast = Markdoc.parse(opts.markdown);
  const content = Markdoc.transform(ast, createPdfConfig());
  const body = Markdoc.renderers.html(content);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<h1>${escapeHtml(opts.title)}</h1>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
