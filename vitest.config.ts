import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    // PGlite (WASM Postgres) instances start slowly when many test files
    // run in parallel alongside a dev server; cap concurrency so cold
    // starts don't stampede each other, and give them generous headroom
    testTimeout: 30_000,
    maxWorkers: 6,
  },
});
