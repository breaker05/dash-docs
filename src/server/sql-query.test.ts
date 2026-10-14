import { describe, expect, it } from "vitest";
import { checkReadOnlySql, formatQueryResult, MAX_ROWS } from "./sql-query";

describe("checkReadOnlySql", () => {
  it("accepts single read statements and strips a trailing semicolon", () => {
    expect(checkReadOnlySql("select id from vendors;")).toBe("select id from vendors");
    expect(checkReadOnlySql("  WITH v AS (select 1) select * from v")).toContain("WITH");
    expect(checkReadOnlySql("explain select 1")).toBe("explain select 1");
    expect(checkReadOnlySql("(select 1)")).toBe("(select 1)");
  });

  it("allows semicolons and keywords inside strings, identifiers and comments", () => {
    expect(() =>
      checkReadOnlySql(
        `select * from vendors where name = 'a; delete from x' -- drop; \n and "weird;col" is not null`,
      ),
    ).not.toThrow();
    expect(() => checkReadOnlySql("select created_at, updated_at from t")).not.toThrow();
  });

  it("rejects writes, DDL and stacked statements", () => {
    expect(() => checkReadOnlySql("delete from vendors")).toThrow(/read queries/);
    expect(() => checkReadOnlySql("drop table vendors")).toThrow(/read queries/);
    expect(() => checkReadOnlySql("select 1; delete from vendors")).toThrow(/one statement/);
    expect(() =>
      checkReadOnlySql("with d as (delete from vendors returning *) select * from d"),
    ).toThrow(/Data-modifying/);
    expect(() => checkReadOnlySql("   ")).toThrow(/empty/);
  });
});

describe("formatQueryResult", () => {
  it("summarizes rows and flags truncation", () => {
    const out = formatQueryResult({
      columns: ["id", "name"],
      rows: [{ id: "u1", name: "ParkMobile" }],
      rowCount: MAX_ROWS + 5,
      truncated: true,
      ms: 3,
    });
    expect(out).toMatch(/^205 rows \(showing the first 1/);
    expect(out).toContain('"ParkMobile"');
  });

  it("caps very large output", () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ i, blob: "x".repeat(500) }));
    const out = formatQueryResult({ columns: ["i", "blob"], rows, rowCount: 200, truncated: false, ms: 1 });
    expect(out.length).toBeLessThan(41_000);
    expect(out).toContain("output cut");
  });

  it("handles no rows", () => {
    expect(formatQueryResult({ columns: [], rows: [], rowCount: 0, truncated: false, ms: 1 })).toBe("0 rows");
  });
});
