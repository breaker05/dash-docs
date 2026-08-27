import { describe, expect, it } from "vitest";
import { buildAskPrompt, trimHistory } from "./ask-prompt";

describe("buildAskPrompt", () => {
  it("numbers sources, includes paths, truncates long content", () => {
    const prompt = buildAskPrompt([
      { n: 1, title: "Lead API", path: "api/lead", markdown: "POST /lead/submit" },
      { n: 2, title: 'Say "hi"', path: "guides/hi", markdown: "x".repeat(6000) },
    ]);
    expect(prompt).toContain('<source n="1" title="Lead API" path="/api/lead">');
    expect(prompt).toContain("POST /lead/submit");
    // title quoting stays valid
    expect(prompt).toContain('title="Say \\"hi\\""');
    expect(prompt).toContain("…(truncated)");
    expect(prompt).not.toContain("x".repeat(5001));
    expect(prompt).toContain("ONLY the documentation sources");
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
