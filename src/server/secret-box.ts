import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for credentials stored in the database (integration
 * connection strings and tokens). The key is derived from INTEGRATIONS_SECRET,
 * falling back to AUTH_SECRET so no extra env var is required — but setting a
 * dedicated one means rotating the auth secret never strands stored creds.
 *
 * Format: "v1:<iv>:<tag>:<ciphertext>", each part base64url.
 */

function key(): Buffer {
  const secret = process.env.INTEGRATIONS_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Set INTEGRATIONS_SECRET (or AUTH_SECRET) to store integration credentials",
    );
  }
  return Buffer.from(
    hkdfSync("sha256", secret, "dash-docs", "integration-credentials", 32),
  );
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", ...[iv, tag, ct].map((b) => b.toString("base64url"))].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, ct] = stored.split(":");
  if (version !== "v1" || !iv || !tag || ct === undefined) {
    throw new Error("Unrecognized encrypted secret");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
