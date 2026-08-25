import { describe, expect, it } from "vitest";
import { buildPdfTemplate } from "./chrome";

describe("buildPdfTemplate", () => {
  it("substitutes tokens and splits sections on |", () => {
    const html = buildPdfTemplate("{title} | Page {page} of {pages}", {
      title: "Lead API",
      url: "https://docs.dashmarketing.io/lead",
      date: new Date("2026-08-25T12:00:00Z"),
    });
    expect(html).toContain("Lead API");
    expect(html).toContain('<span class="pageNumber"></span>');
    expect(html).toContain('<span class="totalPages"></span>');
    expect(html.match(/<span>/g)?.length).toBe(2);
  });

  it("escapes HTML in both template and values", () => {
    const html = buildPdfTemplate("<script>bad</script> {title}", {
      title: "<img src=x onerror=1>",
      url: "",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("substitutes {date} and {url}", () => {
    const html = buildPdfTemplate("{date} · {url}", {
      title: "t",
      url: "https://example.com/x",
      date: new Date("2026-08-25T12:00:00Z"),
    });
    expect(html).toContain("August 25, 2026");
    expect(html).toContain("https://example.com/x");
  });
});
