/**
 * Validate and normalize an externally-supplied page path (MCP tools, etc.).
 *
 * Page paths are database keys — slug segments joined by "/" — never
 * filesystem paths. Segments may contain unicode letters/digits (slugs are
 * generated with github-slugger), underscores, and dashes. Dots, backslashes,
 * percent signs, whitespace, and control characters are all rejected, which
 * makes traversal sequences ("..", "./", encoded variants) structurally
 * impossible rather than filtered.
 *
 * Returns the normalized path (trimmed, lowercased, outer slashes stripped)
 * or null when the input is not a well-formed page path.
 */
const SEGMENT_RE = /^[\p{L}\p{N}\p{M}_-]+$/u;
const MAX_LENGTH = 300;

export function normalizePagePath(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) return null;
  if (/[\x00-\x1f\x7f\\]/.test(trimmed)) return null;
  const stripped = trimmed.replace(/^\/+|\/+$/g, "");
  if (stripped === "") return null;
  const segments = stripped.split("/");
  for (const segment of segments) {
    if (!SEGMENT_RE.test(segment)) return null;
  }
  return segments.join("/");
}
