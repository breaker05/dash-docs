import { describe, expect, it } from "vitest";
import {
  costOfUsage,
  DEFAULT_CORPUS_TOKEN_BUDGET,
  effectiveCorpusCharBudget,
  resolveAskModel,
  resolveCorpusTokenBudget,
} from "./ask-models";

const sonnet = resolveAskModel("claude-sonnet-5-5"); // 1M context
const haiku = resolveAskModel("claude-haiku-4-5"); // 200K context
const haiku55 = resolveAskModel("claude-haiku-5-5"); // two rate cards

describe("resolveAskModel", () => {
  it("defaults to Sonnet 5.5 and upgrades removed models to their successor", () => {
    expect(resolveAskModel(null).id).toBe("claude-sonnet-5-5");
    expect(resolveAskModel("not-a-model").id).toBe("claude-sonnet-5-5");
    expect(resolveAskModel("claude-sonnet-5").id).toBe("claude-sonnet-5-5");
    expect(resolveAskModel("claude-opus-5").id).toBe("claude-opus-5-5");
    expect(resolveAskModel("claude-haiku-4-5").id).toBe("claude-haiku-4-5");
  });
});

describe("resolveCorpusTokenBudget", () => {
  it("parses a stored token count", () => {
    expect(resolveCorpusTokenBudget("100000")).toBe(100000);
    expect(resolveCorpusTokenBudget("0")).toBe(0);
  });
  it("falls back to the default for junk/missing values", () => {
    expect(resolveCorpusTokenBudget(null)).toBe(DEFAULT_CORPUS_TOKEN_BUDGET);
    expect(resolveCorpusTokenBudget("abc")).toBe(DEFAULT_CORPUS_TOKEN_BUDGET);
    expect(resolveCorpusTokenBudget("-5")).toBe(DEFAULT_CORPUS_TOKEN_BUDGET);
  });
});

describe("effectiveCorpusCharBudget", () => {
  it("honors the configured budget when the model can hold it", () => {
    // 200K tokens on a 1M model → 200K * 4 chars
    expect(effectiveCorpusCharBudget(sonnet, 200_000)).toBe(800_000);
  });

  it("caps to the model's safe context (Haiku can't hold 200K tokens)", () => {
    // 200K context - 32K headroom = 168K safe → 672K chars, below 200K*4
    expect(effectiveCorpusCharBudget(haiku, 200_000)).toBe(168_000 * 4);
  });

  it("'max for the model' (1M) is capped per model", () => {
    expect(effectiveCorpusCharBudget(sonnet, 1_000_000)).toBe(968_000 * 4);
    expect(effectiveCorpusCharBudget(haiku, 1_000_000)).toBe(168_000 * 4);
  });

  it("a zero budget disables whole-corpus mode", () => {
    expect(effectiveCorpusCharBudget(sonnet, 0)).toBe(0);
  });
});

describe("costOfUsage", () => {
  it("prices each token class at the model's rate", () => {
    // Sonnet 5.5: input $2, output $10, cacheRead $0.2 per 1M
    const cost = costOfUsage(sonnet, {
      input: 1000,
      output: 500,
      cacheRead: 100_000,
      cacheWrite: 0,
    });
    // (1000*2 + 500*10 + 100000*0.2) / 1e6 = 27000/1e6
    expect(cost).toBeCloseTo(0.027, 6);
  });

  it("switches Haiku 5.5 to the long-prompt rate card past 100K prompt tokens", () => {
    const short = { input: 50_000, output: 1_000, cacheRead: 0, cacheWrite: 0 };
    // (50000*0.1 + 1000*0.5) / 1e6
    expect(costOfUsage(haiku55, short)).toBeCloseTo(0.0055, 6);
    // cached corpus counts toward the prompt size: 2K + 150K cached = long
    const long = { input: 2_000, output: 1_000, cacheRead: 150_000, cacheWrite: 0 };
    // (2000*0.5 + 1000*2.5 + 150000*0.05) / 1e6
    expect(costOfUsage(haiku55, long)).toBeCloseTo(0.011, 6);
  });

  it("prices a fallback answer at the model that actually served it", () => {
    const u = { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 };
    const opus = resolveAskModel("claude-opus-5-5");
    expect(costOfUsage(opus, u)).toBe(4);
    expect(costOfUsage(opus, u, "claude-opus-4-8")).toBe(5);
    expect(costOfUsage(opus, u, "claude-opus-5-5")).toBe(4);
    // a dated snapshot id is the same model: Haiku 5.5's long-prompt card holds
    const long = { input: 200_000, output: 0, cacheRead: 0, cacheWrite: 0 };
    expect(costOfUsage(haiku55, long, "claude-haiku-5-5-20261001")).toBeCloseTo(0.1, 6);
  });

  it("is zero for an empty turn", () => {
    expect(
      costOfUsage(haiku, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
    ).toBe(0);
  });
});
