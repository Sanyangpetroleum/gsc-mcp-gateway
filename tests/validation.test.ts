import { describe, expect, it } from "vitest";
import {
  validateDateRange,
  validateInspectionUrl,
  validateProperty,
  validateSearchRequest,
} from "@/lib/gsc/validation";

describe("GSC request validation", () => {
  it("accepts valid inclusive dates", () => {
    expect(validateDateRange("2026-07-01", "2026-07-28").days).toBe(28);
  });

  it.each([
    ["2026-02-30", "2026-03-01"],
    ["2026/01/01", "2026-02-01"],
    ["2026-03-02", "2026-03-01"],
  ])("rejects malformed or reversed dates", (startDate, endDate) => {
    expect(() => validateDateRange(startDate, endDate)).toThrow();
  });

  it("rejects excessive date ranges and row limits", () => {
    expect(() => validateDateRange("2024-01-01", "2026-01-01")).toThrow("500 days");
    expect(() => validateSearchRequest({
      property: "sc-domain:example.com",
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      rowLimit: 5001,
    })).toThrow("rowLimit");
  });

  it("validates exact GSC property forms", () => {
    expect(() => validateProperty("sc-domain:example.com")).not.toThrow();
    expect(() => validateProperty("https://example.com/")).not.toThrow();
    expect(() => validateProperty("example.com")).toThrow();
    expect(() => validateProperty("sc-domain:example.com/path")).toThrow();
  });

  it("prevents inspection outside the property", () => {
    expect(() => validateInspectionUrl("sc-domain:example.com", "https://blog.example.com/post")).not.toThrow();
    expect(() => validateInspectionUrl("sc-domain:example.com", "https://attacker.example/post")).toThrow();
    expect(() => validateInspectionUrl("https://example.com/blog/", "https://example.com/shop/")).toThrow();
  });

  it("requires hourly data to include the hour dimension", () => {
    expect(() => validateSearchRequest({
      property: "sc-domain:example.com",
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      dimensions: ["date"],
      dataState: "hourly_all",
    })).toThrow("hour dimension");
  });
});
