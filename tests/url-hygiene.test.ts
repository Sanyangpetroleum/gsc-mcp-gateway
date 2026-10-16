import { describe, expect, it } from "vitest";
import { urlHygieneReport } from "@/lib/gsc/url-hygiene";

const cleanUrl = "https://sanyangpetroleum.com/insights/heavy-aromatic-process-oil-bitumen-carbon-black-t80";

describe("Google URL hygiene", () => {
  it("accepts the exact published canonical URL", () => {
    const report = urlHygieneReport(cleanUrl);
    expect(report.clean).toBe(true);
    expect(report.issue).toBeNull();
    expect(report.suggestedUrl).toBe(cleanUrl);
  });

  it("detects the percent-encoded U+2060 word joiner from a real GSC Soft 404 incident", () => {
    const report = urlHygieneReport(cleanUrl + "%E2%81%A0");
    expect(report.clean).toBe(false);
    expect(report.issue).toBe("invisible_unicode_in_url");
    expect(report.invisibleCodePoints).toEqual(["U+2060"]);
    expect(report.suggestedUrl).toBe(cleanUrl);
  });

  it("detects invisible characters even when pasted as literal Unicode", () => {
    const report = urlHygieneReport(cleanUrl + "\u200B");
    expect(report.clean).toBe(false);
    expect(report.invisibleCodePoints).toContain("U+200B");
    expect(report.suggestedUrl).toBe(cleanUrl);
  });

  it("does not silently rewrite a legitimate different slug", () => {
    const other = cleanUrl + "-2";
    expect(urlHygieneReport(other).suggestedUrl).toBe(other);
    expect(urlHygieneReport(other).clean).toBe(true);
  });
});
