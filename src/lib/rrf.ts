/**
 * Reciprocal Rank Fusion: merge several ranked lists into one, favouring items
 * that rank well across lists. Each item contributes 1/(k + rank) per list it
 * appears in; scores sum across lists. This is how the keyword (FTS) and
 * semantic (vector) retrieval results are blended for Ask AI — an item strong
 * in either signal surfaces, and one strong in both wins.
 *
 * `k` (default 60, the value from the original RRF paper) damps the weight of
 * top ranks so a single list can't dominate. `key` identifies the same item
 * across lists; the first occurrence's object is the one returned.
 */
export function reciprocalRankFusion<T>(
  lists: T[][],
  key: (item: T) => string,
  k = 60,
): T[] {
  const scores = new Map<string, number>();
  const items = new Map<string, T>();
  for (const list of lists) {
    list.forEach((item, index) => {
      const id = key(item);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
      if (!items.has(id)) items.set(id, item);
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => items.get(id) as T);
}
