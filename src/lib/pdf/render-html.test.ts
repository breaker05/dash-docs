import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { renderPdfHtml } from "./render-html";

describe("renderPdfHtml", () => {
  it("renders tables, fences, and callouts as plain print-ready HTML", () => {
    const html = renderPdfHtml({
      title: "API <Guide>",
      markdown: [
        "| Field | Type |",
        "| --- | --- |",
        "| id | uuid |",
        "",
        "```json",
        '{ "a": "<script>x</script>" }',
        "```",
        "",
        '{% callout type="warning" title="Careful" %}',
        "Watch out.",
        "{% /callout %}",
      ].join("\n"),
    });
    expect(html).toContain("<title>API &lt;Guide&gt;</title>");
    expect(html).toContain("<table>");
    expect(html).toContain('<pre class="fence">');
    // code content is escaped, not injected
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('class="callout callout-warning"');
    expect(html).toContain("Careful");
  });

  it("handles the largest legacy doc without throwing", () => {
    const md = fs.readFileSync(
      "/Users/keenan/code/dash/dash-docs/CUSTOMER_IMPORT_API.md",
      "utf8",
    );
    const html = renderPdfHtml({ title: "Customer Import API", markdown: md });
    expect(html.length).toBeGreaterThan(10_000);
    expect((html.match(/<table>/g) ?? []).length).toBeGreaterThan(3);
  });
});
