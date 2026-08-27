import { describe, expect, it } from "vitest";
import { normalizePagePath } from "./page-path";

describe("normalizePagePath", () => {
  it("accepts and normalizes well-formed page paths", () => {
    expect(normalizePagePath("lead-submission-api")).toBe(
      "lead-submission-api",
    );
    expect(normalizePagePath("/api-documentation/lead-submission-api/")).toBe(
      "api-documentation/lead-submission-api",
    );
    expect(normalizePagePath("  API-Documentation/Lead-API  ")).toBe(
      "api-documentation/lead-api",
    );
    // slugs generated from titles can carry unicode letters
    expect(normalizePagePath("café--résumé--100-cool")).toBe(
      "café--résumé--100-cool",
    );
    expect(normalizePagePath("legacy_slug_with_underscores")).toBe(
      "legacy_slug_with_underscores",
    );
  });

  it("rejects traversal sequences and malformed input", () => {
    for (const bad of [
      "../../etc/passwd",
      "a/../b",
      "./a",
      "a/./b",
      "..",
      ".",
      "a..b/c", // dots never appear in slugs
      "a//b",
      "a\\b",
      "a%2e%2e/b",
      "a b",
      "a\u0000b",
      "a\nb",
      "",
      "   ",
      "///",
      "x".repeat(301),
    ]) {
      expect(normalizePagePath(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
