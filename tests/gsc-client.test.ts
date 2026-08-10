import { describe, expect, it, vi } from "vitest";
import { GscClient } from "@/lib/gsc/client";
import { GoogleApiError, safeToolError } from "@/lib/gsc/errors";

function json(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("GscClient", () => {
  it("parses Search Analytics dimensions and pagination", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ siteEntry: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteFullUser" }] }))
      .mockResolvedValueOnce(json({
        rows: [{ keys: ["query one", "MOBILE"], clicks: 3, impressions: 30, ctr: 0.1, position: 9.5 }],
        responseAggregationType: "byProperty",
      }));
    const client = new GscClient(async () => "access-token", fetcher as typeof fetch);
    const result = await client.searchAnalytics({
      property: "sc-domain:example.com",
      startDate: "2026-07-01",
      endDate: "2026-07-28",
      dimensions: ["query", "device"],
      rowLimit: 250,
      startRow: 500,
    });
    expect(result.rows[0]).toMatchObject({
      dimensions: { query: "query one", device: "MOBILE" },
      clicks: 3,
      impressions: 30,
      ctr: 0.1,
      position: 9.5,
    });
    const requestBody = JSON.parse(fetcher.mock.calls[1][1].body as string);
    expect(requestBody).toMatchObject({ rowLimit: 250, startRow: 500, type: "web", dataState: "final" });
    expect(fetcher.mock.calls[1][0]).toContain("sc-domain%3Aexample.com");
  });

  it("returns a structured empty result set", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ siteEntry: [{ siteUrl: "https://example.com/" }] }))
      .mockResolvedValueOnce(json({}));
    const result = await new GscClient(async () => "token", fetcher as typeof fetch).searchAnalytics({
      property: "https://example.com/",
      startDate: "2026-07-01",
      endDate: "2026-07-02",
    });
    expect(result.rows).toEqual([]);
    expect(result.rowCount).toBe(0);
  });

  it("rejects inaccessible properties before querying analytics", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ siteEntry: [{ siteUrl: "sc-domain:allowed.com" }] }));
    const client = new GscClient(async () => "token", fetcher as typeof fetch);
    await expect(client.searchAnalytics({
      property: "sc-domain:blocked.com",
      startDate: "2026-07-01",
      endDate: "2026-07-02",
    })).rejects.toMatchObject({ category: "permission" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("parses URL Inspection without adding write operations", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ siteEntry: [{ siteUrl: "sc-domain:example.com" }] }))
      .mockResolvedValueOnce(json({ inspectionResult: { indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed" } } }));
    const result = await new GscClient(async () => "token", fetcher as typeof fetch).inspectUrl(
      "sc-domain:example.com",
      "https://example.com/page",
    );
    expect(result.inspectionResult).toMatchObject({ indexStatusResult: { verdict: "PASS" } });
    expect(fetcher.mock.calls[1][0]).toContain("urlInspection/index:inspect");
  });

  it("retries quota errors then succeeds", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "secret-token" } }, 429, { "retry-after": "0" }))
      .mockResolvedValueOnce(json({ siteEntry: [] }));
    const result = await new GscClient(async () => "token", fetcher as typeof fetch).listProperties();
    expect(result).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("redacts Google response details and credentials", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({
      error: { code: 401, message: "private_key=LEAK token=LEAK", status: "UNAUTHENTICATED" },
    }, 401));
    const client = new GscClient(async () => "gateway-secret", fetcher as typeof fetch);
    let caught: unknown;
    try {
      await client.listProperties();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GoogleApiError);
    const safe = safeToolError(caught);
    expect(JSON.stringify(safe)).not.toContain("LEAK");
    expect(JSON.stringify(safe)).not.toContain("gateway-secret");
  });
});
