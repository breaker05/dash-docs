import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk-text";

describe("chunkText", () => {
  it("returns small content as one chunk and empty as none", () => {
    expect(chunkText("hello world")).toEqual(["hello world"]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("splits multi-line content on line boundaries with overlap", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i} ${"x".repeat(40)}`);
    const content = lines.join("\n");
    const chunks = chunkText(content, { size: 1000, overlap: 200 });

    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1000);
      expect(chunk).not.toBe("");
    }
    // every line survives somewhere
    for (const probe of ["line 0 ", "line 100 ", "line 199 "]) {
      expect(chunks.some((c) => c.includes(probe))).toBe(true);
    }
    // consecutive chunks overlap
    const tail = chunks[0].slice(-50);
    expect(chunks[1].includes(tail.slice(0, 20))).toBe(true);
  });

  it("hard-splits minified single-line content", () => {
    const minified = JSON.stringify({
      paths: Object.fromEntries(
        Array.from({ length: 300 }, (_, i) => [`/endpoint/${i}`, { get: { summary: `op ${i}` } }]),
      ),
    });
    const chunks = chunkText(minified, { size: 2000, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.some((c) => c.includes("/endpoint/250"))).toBe(true);
  });
});
