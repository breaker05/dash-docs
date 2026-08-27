/**
 * Split a text file into retrieval-sized chunks for full-text indexing.
 * Splits on line boundaries near the target size, with a tail overlap so
 * content straddling a boundary is findable in both chunks; minified
 * single-line files (e.g. compact JSON) fall back to hard character splits.
 */
export function chunkText(
  content: string,
  opts: { size?: number; overlap?: number } = {},
): string[] {
  const size = opts.size ?? 3500;
  const overlap = Math.min(opts.overlap ?? 300, Math.floor(size / 2));
  const text = content.trim();
  if (text === "") return [];
  if (text.length <= size) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      // prefer the last line break inside the window (but keep chunks at
      // least half-full so one giant line can't stall progress)
      const newline = text.lastIndexOf("\n", end);
      if (newline > start + size / 2) end = newline;
    }
    const piece = text.slice(start, end).trim();
    if (piece !== "") chunks.push(piece);
    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
