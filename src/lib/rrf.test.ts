import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "./rrf";

const key = (x: { id: string }) => x.id;

describe("reciprocalRankFusion", () => {
  it("returns a single list unchanged in order (deduped)", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(reciprocalRankFusion([list], key).map(key)).toEqual(["a", "b", "c"]);
  });

  it("rewards items that appear in both lists", () => {
    // 'b' is mid-rank in each list but present in both; 'a' and 'x' top one
    // list each. Cross-list agreement should lift 'b' to the top.
    const fts = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const vec = [{ id: "x" }, { id: "b" }, { id: "y" }];
    const fused = reciprocalRankFusion([fts, vec], key).map(key);
    expect(fused[0]).toBe("b");
    expect(new Set(fused)).toEqual(new Set(["a", "b", "c", "x", "y"]));
  });

  it("keeps a top-ranked unique item ahead of low-ranked ones", () => {
    const l1 = [{ id: "a" }, { id: "b" }];
    const l2 = [{ id: "a" }, { id: "c" }];
    const fused = reciprocalRankFusion([l1, l2], key).map(key);
    expect(fused[0]).toBe("a"); // rank-1 in both
  });

  it("smaller k sharpens the advantage of top ranks", () => {
    const l1 = [{ id: "top" }, ...Array.from({ length: 10 }, (_, i) => ({ id: `l1-${i}` }))];
    const l2 = Array.from({ length: 10 }, (_, i) => ({ id: `l2-${i}` }));
    // 'top' is rank 1 in l1 only. With small k its 1/(k+1) dominates.
    const fused = reciprocalRankFusion([l1, l2], key, 1).map(key);
    expect(fused[0]).toBe("top");
  });

  it("handles empty lists", () => {
    expect(reciprocalRankFusion([[], []], key)).toEqual([]);
    expect(reciprocalRankFusion([], key)).toEqual([]);
  });
});
