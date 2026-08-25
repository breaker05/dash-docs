/**
 * Canonical site origin for absolute URLs (llms.txt, sitemap, .md source
 * lines, MCP setup snippets). Guards against a localhost
 * NEXT_PUBLIC_SITE_URL leaking into a deployed environment by falling back
 * to Vercel's production domain.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit && !explicit.includes("localhost")) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return explicit ?? "http://localhost:3000";
}
