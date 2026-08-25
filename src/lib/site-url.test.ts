import { afterEach, describe, expect, it } from "vitest";
import { siteUrl } from "./site-url";

const ENV = { ...process.env };
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = ENV.NEXT_PUBLIC_SITE_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = ENV.VERCEL_PROJECT_PRODUCTION_URL;
});

describe("siteUrl", () => {
  it("uses an explicit non-localhost URL, trimming trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://docs.dashmarketing.io/";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "dash-docs.vercel.app";
    expect(siteUrl()).toBe("https://docs.dashmarketing.io");
  });

  it("ignores a localhost value when a Vercel domain exists (misconfigured deploy)", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "dash-docs.vercel.app";
    expect(siteUrl()).toBe("https://dash-docs.vercel.app");
  });

  it("keeps localhost for local dev", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
  });

  it("falls back to localhost when nothing is set", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    expect(siteUrl()).toBe("http://localhost:3000");
  });
});
