import { describe, expect, it } from "vitest";
import { formatTokens, formatUsd } from "./format-usage";

describe("formatTokens", () => {
  it("abbreviates thousands and millions", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1500)).toBe("1.5K");
    expect(formatTokens(2_500_000)).toBe("2.5M");
  });
});

describe("formatUsd", () => {
  it("uses more precision for sub-cent amounts", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.0027)).toBe("$0.0027");
    expect(formatUsd(0.023)).toBe("$0.023");
    expect(formatUsd(1.5)).toBe("$1.50");
  });
});
