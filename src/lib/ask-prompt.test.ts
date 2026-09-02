import { describe, expect, it } from "vitest";
import {
  buildAskPrompt,
  buildOrQuery,
  citedSourceNumbers,
  trimHistory,
} from "./ask-prompt";

describe("buildOrQuery", () => {
  it("ORs significant words for recall-mode retrieval", () => {
    expect(buildOrQuery("do you know about the Import Rules page?")).toBe(
      "you or know or about or the or import or rules or page",
    );
    expect(buildOrQuery("a of it")).toBe("");
    // dedupes and drops literal "or"
    expect(buildOrQuery("rules or rules")).toBe("rules");
  });
});

describe("buildAskPrompt", () => {
  it("numbers sources, includes paths, truncates long content", () => {
    const prompt = buildAskPrompt([
      { n: 1, title: "Lead API", path: "api/lead", markdown: "POST /lead/submit", kind: "page" },
      { n: 2, title: 'Say "hi"', path: "guides/hi", markdown: "x".repeat(6000), kind: "page" },
      { n: 3, title: "swagger.json (part 2)", path: "", markdown: '{"paths":{}}', kind: "file" },
    ]);
    expect(prompt).toContain('<source n="1" title="Lead API" path="/api/lead">');
    expect(prompt).toContain("POST /lead/submit");
    // title quoting stays valid
    expect(prompt).toContain('title="Say \\"hi\\""');
    expect(prompt).toContain("…(truncated)");
    expect(prompt).not.toContain("x".repeat(5001));
    expect(prompt).toContain("ONLY the documentation sources");
    // reference files carry a kind marker instead of a path
    expect(prompt).toContain(
      '<source n="3" title="swagger.json (part 2)" kind="reference-file">',
    );
  });

  it("does not truncate when maxSourceChars is Infinity (whole-corpus mode)", () => {
    const big = "y".repeat(9000);
    const prompt = buildAskPrompt(
      [{ n: 1, title: "Big", path: "big", markdown: big, kind: "page" }],
      { maxSourceChars: Infinity },
    );
    expect(prompt).toContain(big);
    expect(prompt).not.toContain("…(truncated)");
  });
});

describe("citedSourceNumbers", () => {
  it("extracts the [n] markers the model actually cited", () => {
    const answer = "Use the endpoint [1]. Also see rate limits [3] and [3] again.";
    expect([...citedSourceNumbers(answer)].sort()).toEqual([1, 3]);
  });

  it("returns an empty set when nothing is cited", () => {
    expect(citedSourceNumbers("I don't have that information.").size).toBe(0);
  });
});

describe("trimHistory", () => {
  it("keeps the last turns, drops junk, caps length", () => {
    const history = [
      ...Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `turn ${i}`,
      })),
      { role: "user" as const, content: "   " },
      { role: "user" as const, content: "y".repeat(9000) },
    ];
    const trimmed = trimHistory(history);
    expect(trimmed).toHaveLength(6);
    expect(trimmed[0].content).toBe("turn 5");
    expect(trimmed.at(-1)!.content).toHaveLength(4000);
  });
});
