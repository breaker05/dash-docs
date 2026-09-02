import { describe, expect, it } from "vitest";
import {
  DEFAULT_CORPUS_TOKEN_BUDGET,
  effectiveCorpusCharBudget,
  resolveAskModel,
  resolveCorpusTokenBudget,
} from "./ask-models";

const sonnet = resolveAskModel("claude-sonnet-5"); // 1M context
const haiku = resolveAskModel("claude-haiku-4-5"); // 200K context

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
