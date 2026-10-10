import { describe, expect, it } from "vitest";
import type { SearchAnalyticsResult } from "@/lib/gsc/types";
import {
  buyerIntent, keywordOpportunities, searchTrendSignals,
  sitePageOpportunities, pageEditorialBrief, validateComparableWindows,
} from "@/lib/seo/analysis";

type Entry = SearchAnalyticsResult["rows"][number];
function result(
  startDate: string, endDate: string, dimensions: SearchAnalyticsResult["dimensions"],
  rows: Entry[], rowLimit = 1000,
): SearchAnalyticsResult {
  return {
    property: "sc-domain:example.com",
    period: { startDate, endDate }, dimensions,
    dataState: "final", searchType: "web", rowCount: rows.length,
    rowLimit, startRow: 0, rows, limitations: ["top rows sampled"],
  };
}
const a = { startDate: "2026-07-01", endDate: "2026-07-28" };
const b = { startDate: "2026-07-29", endDate: "2026-08-25" };
function row(query: string, page: string, clicks: number, impressions: number, position: number): Entry {
  return {
    dimensions: { query, page }, clicks, impressions, position,
    ctr: impressions ? clicks / impressions : 0,
  };
}
describe("SEO intelligence model", () => {
  it("checks equal non-overlapping periods", () => {
    expect(() => validateComparableWindows(a, b)).not.toThrow();
    expect(() => validateComparableWindows(b, a)).toThrow("before");
    expect(() => validateComparableWindows(a, { startDate: "2026-07-29", endDate: "2026-08-05" })).toThrow("same");
  });
  it("recognizes commercial intent without making up search volume", () => {
    expect(buyerIntent("bulk process oil supplier malaysia")).toBe("procurement");
    expect(buyerIntent("Group III price USD per MT")).toBe("commercial_research");
    expect(buyerIntent("what is mineral oil")).toBe("informational_or_unknown");
    const data = result(a.startDate, a.endDate, ["query", "page"], [
      row("bulk process oil supplier malaysia", "https://example.com/a", 4, 100, 8),
      row("what is mineral oil", "https://example.com/b", 1, 20, 3),
    ]);
    const ranked = keywordOpportunities(data, 25, 2);
    expect(ranked.opportunities).toHaveLength(1);
    expect(ranked.opportunities[0].intent).toBe("procurement");
    expect(ranked.opportunities[0].rankBand).toBe("mid_position");
    expect(JSON.stringify(ranked)).toContain("NOT all Google search demand");
  });
  it("detects property-specific rises, declines and newly-observed top rows without global Trend claims", () => {
    const previous = result(a.startDate, a.endDate, ["query"], [
      row("base oil supplier", "", 4, 30, 8),
      row("rpo import", "", 15, 110, 4),
    ]);
    const current = result(b.startDate, b.endDate, ["query"], [
      row("base oil supplier", "", 10, 95, 7),
      row("rpo import", "", 1, 25, 12),
      row("iso tank", "", 0, 60, 18),
    ]);
    const signals = searchTrendSignals(previous, current);
    expect(signals.rising[0].query).toBe("base oil supplier");
    expect(signals.declining[0].query).toBe("rpo import");
    expect(signals.newlyObserved[0].query).toBe("iso tank");
    expect(signals.terminology).toContain("not Google Trends");
  });
  it("surfaces declines on existing pages using real comparable rows", () => {
    const previous = result(a.startDate, a.endDate, ["page"], [
      { ...row("", "https://example.com/a", 30, 250, 7) },
    ]);
    const current = result(b.startDate, b.endDate, ["page"], [
      { ...row("", "https://example.com/a", 11, 140, 8) },
    ]);
    const entries = sitePageOpportunities(previous, current);
    expect(entries.opportunities[0].trend).toBe("clicks_declining");
    expect(entries.opportunities[0].clickChange).toBe(-19);
  });
  it("builds a bounded page recommendation with indexed-version evidence", () => {
    const before = result(a.startDate, a.endDate, [], [row("", "", 12, 100, 8)]);
    const after = result(b.startDate, b.endDate, [], [row("", "", 5, 100, 10)]);
    const queries = result(b.startDate, b.endDate, ["query"], [
      row("supplier RFQ", "", 5, 100, 10),
    ]);
    const brief = pageEditorialBrief("https://example.com/a", before, after, queries, {
      indexStatusResult: {
        verdict: "NEUTRAL", googleCanonical: "https://example.com/other",
        coverageState: "Crawled - currently not indexed",
      },
    });
    expect(brief.indexedVersion?.googleCanonical).toBe("https://example.com/other");
    expect(brief.recommendedChecks.join(" ")).toContain("canonical");
    expect(brief.topQueries[0].intent).toBe("procurement");
    expect(brief.limitations.join(" ")).toContain("does not fetch live HTML");
  });
});
