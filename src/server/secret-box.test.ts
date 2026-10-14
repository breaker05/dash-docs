import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secret-box";

describe("secret-box", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.INTEGRATIONS_SECRET = "test-secret-one";
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it("round-trips and never stores the plaintext", () => {
    const plain = "postgresql://reader:hunter2@db.example.com/dash";
    const enc = encryptSecret(plain);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("hunter2");
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("fails to decrypt under a different key or when tampered", () => {
    const enc = encryptSecret("token");
    process.env.INTEGRATIONS_SECRET = "another-secret";
    expect(() => decryptSecret(enc)).toThrow();
    process.env.INTEGRATIONS_SECRET = "test-secret-one";
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("falls back to AUTH_SECRET", () => {
    delete process.env.INTEGRATIONS_SECRET;
    process.env.AUTH_SECRET = "auth-secret";
    expect(decryptSecret(encryptSecret("x"))).toBe("x");
  });
});
