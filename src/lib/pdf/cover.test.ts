import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildCoverHtml } from "./cover";
import { mergePdfs } from "./merge";

describe("buildCoverHtml", () => {
  it("renders logo, title, site name, and date", () => {
    const html = buildCoverHtml({
      title: "Lead Submission API",
      logoSrc: "data:image/png;base64,AAAA",
      date: new Date("2026-08-25T12:00:00Z"),
    });
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain("<h1>Lead Submission API</h1>");
    expect(html).toContain("Dash Marketing Docs");
    expect(html).toContain("August 25, 2026");
  });

  it("escapes HTML in the title and logo src", () => {
    const html = buildCoverHtml({
      title: '<script>alert("x")</script>',
      logoSrc: '"><img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('src="">');
    expect(html).toContain("&quot;&gt;&lt;img");
  });
});

describe("mergePdfs", () => {
  it("concatenates pages in order", async () => {
    const a = await PDFDocument.create();
    a.addPage([200, 200]);
    const b = await PDFDocument.create();
    b.addPage([300, 300]);
    b.addPage([300, 300]);

    const merged = await mergePdfs([await a.save(), await b.save()]);
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getWidth()).toBe(200);
    expect(doc.getPage(1).getWidth()).toBe(300);
  });
});
