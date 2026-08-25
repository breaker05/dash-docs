import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chromium ships native binaries that must not be bundled
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // chromium loads bin/*.br via fs at runtime — invisible to static file
  // tracing, so Vercel would omit them from the deployed function.
  // (glob key: a literal [id] segment would parse as a character class)
  outputFileTracingIncludes: {
    "/api/pages/**": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  images: {
    remotePatterns: [
      // Vercel Blob public URLs
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Google account avatars
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
};

export default nextConfig;
