import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db";
import { rateLimits } from "@/db/schema";
import { checkRateLimit, requestIp } from "./rate-limit";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
});

afterEach(async () => {
  await close();
});

describe("checkRateLimit", () => {
  it("allows up to the limit, then blocks with retry info", async () => {
    const now = new Date("2026-08-26T12:00:10Z");
    const opts = { key: "t:ip:1.2.3.4", limit: 3, windowSeconds: 60, now };

    for (let i = 1; i <= 3; i++) {
      const r = await checkRateLimit(db, opts);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(3 - i);
    }
    const blocked = await checkRateLimit(db, opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("resets in the next window and sweeps expired buckets", async () => {
    const key = "t:ip:5.6.7.8";
    const w1 = new Date("2026-08-26T12:00:10Z");
    const w2 = new Date("2026-08-26T12:01:10Z"); // next 60s bucket

    for (let i = 0; i < 4; i++) {
      await checkRateLimit(db, { key, limit: 3, windowSeconds: 60, now: w1 });
    }
    const fresh = await checkRateLimit(db, {
      key,
      limit: 3,
      windowSeconds: 60,
      now: w2,
    });
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(2);

    // the first hit of the new window swept the expired bucket
    const rows = await db.select().from(rateLimits);
    expect(rows).toHaveLength(1);
  });

  it("isolates different keys", async () => {
    const now = new Date("2026-08-26T12:00:10Z");
    await checkRateLimit(db, { key: "a", limit: 1, windowSeconds: 60, now });
    const other = await checkRateLimit(db, {
      key: "b",
      limit: 1,
      windowSeconds: 60,
      now,
    });
    expect(other.allowed).toBe(true);
  });
});

describe("requestIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });
    expect(requestIp(req)).toBe("9.9.9.9");
    expect(requestIp(new Request("http://x"))).toBe("unknown");
  });
});
