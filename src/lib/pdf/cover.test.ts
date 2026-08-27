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

describe("buildTocHtml", () => {
  it("renders escaped entries with depth indentation and page numbers", async () => {
    const { buildTocHtml } = await import("./cover");
    const html = buildTocHtml({
      sectionTitle: "API <Docs>",
      entries: [
        { title: "Overview", depth: 0, page: 1 },
        { title: "Lead & Submit", depth: 1, page: 3 },
      ],
    });
    expect(html).toContain("API &lt;Docs&gt;");
    expect(html).toContain("Lead &amp; Submit");
    expect(html).toContain('padding-left:18px');
    expect(html).toContain("<span class=\"n\">3</span>");
  });
});

describe("stampFooters / winAnsiSafe", () => {
  it("stamps footers on content pages only", async () => {
    const { stampFooters, countPages, mergePdfs, winAnsiSafe } = await import(
      "./merge"
    );
    const { PDFDocument } = await import("pdf-lib");
    const make = async (n: number) => {
      const d = await PDFDocument.create();
      for (let i = 0; i < n; i++) d.addPage([612, 792]);
      return d.save();
    };
    const merged = await mergePdfs([await make(2), await make(3)]);
    const stamped = await stampFooters(merged, {
      leftText: "Guide — Dash Docs ⟪drop⟫",
      skipPages: 2,
    });
    expect(await countPages(stamped)).toBe(5);
    expect(winAnsiSafe("Guide — Dash ⟪x⟫ Café")).toBe("Guide — Dash x Café");
  });
});
