import { describe, expect, it } from "vitest";
import { compareSearchPeriods } from "@/lib/gsc/comparison";
import type { SearchAnalyticsResult } from "@/lib/gsc/types";

function period(startDate: string, endDate: string, rows: SearchAnalyticsResult["rows"]): SearchAnalyticsResult {
  return {
    property: "sc-domain:example.com",
    period: { startDate, endDate },
    dimensions: ["page"],
    searchType: "web",
    dataState: "final",
    rowCount: rows.length,
    startRow: 0,
    rowLimit: 100,
    rows,
    limitations: [],
  };
}

describe("period comparison", () => {
  it("calculates B minus A and preserves dropped/new rows", () => {
    const a = period("2026-06-01", "2026-06-28", [
      { dimensions: { page: "/lost" }, clicks: 10, impressions: 100, ctr: 0.1, position: 9 },
      { dimensions: { page: "/same" }, clicks: 5, impressions: 50, ctr: 0.1, position: 12 },
    ]);
    const b = period("2026-06-29", "2026-07-26", [
      { dimensions: { page: "/same" }, clicks: 8, impressions: 80, ctr: 0.1, position: 10 },
      { dimensions: { page: "/new" }, clicks: 4, impressions: 40, ctr: 0.1, position: 7 },
    ]);
    const result = compareSearchPeriods(a, b);
    const lost = result.rows.find((row) => row.dimensions.page === "/lost");
    const same = result.rows.find((row) => row.dimensions.page === "/same");
    const fresh = result.rows.find((row) => row.dimensions.page === "/new");
    expect(lost?.clicks).toMatchObject({ absoluteChange: -10, percentChange: -100 });
    expect(same?.clicks).toMatchObject({ absoluteChange: 3, percentChange: 60 });
    expect(same?.position.improvement).toBe(2);
    expect(fresh?.clicks.percentChange).toBeNull();
    expect(result.changeConvention).toContain("periodB minus periodA");
  });

  it("rejects mismatched dimensions", () => {
    const a = period("2026-01-01", "2026-01-02", []);
    const b: SearchAnalyticsResult = {
      ...period("2026-01-03", "2026-01-04", []),
      dimensions: ["query"],
    };
    expect(() => compareSearchPeriods(a, b)).toThrow("identical dimensions");
  });
});
