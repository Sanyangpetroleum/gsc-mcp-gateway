import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createGscClientFromEnv } from "@/lib/gsc/client";
import { compareSearchPeriods } from "@/lib/gsc/comparison";
import { safeToolError } from "@/lib/gsc/errors";
import type { SearchAnalyticsResult } from "@/lib/gsc/types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const property = z.string().min(1).max(2048);
const dimension = z.enum(["query", "page", "country", "device", "date", "hour", "searchAppearance"]);
const searchType = z.enum(["web", "image", "video", "news", "discover", "googleNews"]);
const dataState = z.enum(["final", "all", "hourly_all"]);
const filter = z.object({
  dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
  operator: z.enum([
    "contains",
    "equals",
    "notContains",
    "notEquals",
    "includingRegex",
    "excludingRegex",
  ]),
  expression: z.string().min(1).max(4096),
});
const period = z.object({ startDate: date, endDate: date });
const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

function result(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function errorResult(error: unknown) {
  const safe = safeToolError(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: safe }) }],
    structuredContent: { error: safe },
  };
}

async function observed<T>(tool: string, action: () => Promise<T>) {
  const started = Date.now();
  try {
    const value = await action();
    console.info(JSON.stringify({
      event: "mcp_tool",
      tool,
      timestamp: new Date().toISOString(),
      success: true,
      latencyMs: Date.now() - started,
      googleStatusCategory: "success",
    }));
    return result(value);
  } catch (error) {
    const safe = safeToolError(error);
    console.warn(JSON.stringify({
      event: "mcp_tool",
      tool,
      timestamp: new Date().toISOString(),
      success: false,
      latencyMs: Date.now() - started,
      googleStatusCategory: safe.googleStatusCategory ?? "not_called",
      errorCode: safe.code,
    }));
    return errorResult(error);
  }
}

function sortRows(
  response: SearchAnalyticsResult,
  sortBy: "clicks" | "impressions" | "ctr" | "position",
  sortDirection: "asc" | "desc",
) {
  const factor = sortDirection === "asc" ? 1 : -1;
  response.rows.sort((a, b) => (a[sortBy] - b[sortBy]) * factor);
  return response;
}

export function registerGscTools(server: McpServer) {
  server.registerTool(
    "gsc_list_properties",
    {
      title: "List Search Console properties",
      description: "List exact Google Search Console property identifiers accessible to the gateway's read-only Google identity. Call this first when the property identifier is unknown.",
      inputSchema: z.object({}),
      annotations,
    },
    async () => observed("gsc_list_properties", async () => {
      const entries = await createGscClientFromEnv().listProperties(true);
      return { count: entries.length, properties: entries };
    }),
  );

  server.registerTool(
    "gsc_search_analytics",
    {
      title: "Query Search Analytics",
      description: "Flexible read-only Search Analytics query with dimensions, filters and pagination. Dates are inclusive and interpreted by Google in Pacific Time. The gateway caps each call at 5,000 rows.",
      inputSchema: z.object({
        property,
        startDate: date,
        endDate: date,
        dimensions: z.array(dimension).max(7).default([]),
        filters: z.array(filter).max(10).optional(),
        searchType: searchType.default("web"),
        dataState: dataState.default("final"),
        rowLimit: z.number().int().min(1).max(5000).default(100),
        startRow: z.number().int().min(0).default(0),
      }),
      annotations,
    },
    async (input) => observed("gsc_search_analytics", () => createGscClientFromEnv().searchAnalytics(input)),
  );

  server.registerTool(
    "gsc_query_performance",
    {
      title: "Analyse query performance",
      description: "Convenience query-level performance view. Supports page, country and device narrowing, minimum-impression filtering and local metric sorting.",
      inputSchema: z.object({
        property,
        startDate: date,
        endDate: date,
        page: z.string().url().optional(),
        country: z.string().regex(/^[A-Za-z]{3}$/).optional(),
        device: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional(),
        queryContains: z.string().min(1).max(4096).optional(),
        searchType: searchType.default("web"),
        dataState: dataState.default("final"),
        rowLimit: z.number().int().min(1).max(5000).default(250),
        minImpressions: z.number().min(0).default(0),
        sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
        sortDirection: z.enum(["asc", "desc"]).default("desc"),
      }),
      annotations,
    },
    async (input) => observed("gsc_query_performance", async () => {
      const filters = [
        ...(input.page ? [{ dimension: "page" as const, operator: "equals" as const, expression: input.page }] : []),
        ...(input.country ? [{ dimension: "country" as const, operator: "equals" as const, expression: input.country.toLowerCase() }] : []),
        ...(input.device ? [{ dimension: "device" as const, operator: "equals" as const, expression: input.device }] : []),
        ...(input.queryContains ? [{ dimension: "query" as const, operator: "contains" as const, expression: input.queryContains }] : []),
      ];
      const response = await createGscClientFromEnv().searchAnalytics({
        ...input,
        dimensions: ["query"],
        filters,
      });
      response.rows = response.rows.filter((row) => row.impressions >= input.minImpressions);
      response.rowCount = response.rows.length;
      return sortRows(response, input.sortBy, input.sortDirection);
    }),
  );

  server.registerTool(
    "gsc_page_performance",
    {
      title: "Analyse page performance",
      description: "Convenience page-level performance view. Supports query, country and device narrowing, minimum-impression filtering and local metric sorting.",
      inputSchema: z.object({
        property,
        startDate: date,
        endDate: date,
        queryContains: z.string().min(1).max(4096).optional(),
        pageContains: z.string().min(1).max(4096).optional(),
        country: z.string().regex(/^[A-Za-z]{3}$/).optional(),
        device: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional(),
        searchType: searchType.default("web"),
        dataState: dataState.default("final"),
        rowLimit: z.number().int().min(1).max(5000).default(250),
        minImpressions: z.number().min(0).default(0),
        sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
        sortDirection: z.enum(["asc", "desc"]).default("desc"),
      }),
      annotations,
    },
    async (input) => observed("gsc_page_performance", async () => {
      const filters = [
        ...(input.queryContains ? [{ dimension: "query" as const, operator: "contains" as const, expression: input.queryContains }] : []),
        ...(input.pageContains ? [{ dimension: "page" as const, operator: "contains" as const, expression: input.pageContains }] : []),
        ...(input.country ? [{ dimension: "country" as const, operator: "equals" as const, expression: input.country.toLowerCase() }] : []),
        ...(input.device ? [{ dimension: "device" as const, operator: "equals" as const, expression: input.device }] : []),
      ];
      const response = await createGscClientFromEnv().searchAnalytics({
        ...input,
        dimensions: ["page"],
        filters,
      });
      response.rows = response.rows.filter((row) => row.impressions >= input.minImpressions);
      response.rowCount = response.rows.length;
      return sortRows(response, input.sortBy, input.sortDirection);
    }),
  );

  server.registerTool(
    "gsc_url_inspection",
    {
      title: "Inspect indexed URL",
      description: "Read Google's indexed-version inspection result for one URL. This is analytical only and does not request indexing or run a live test.",
      inputSchema: z.object({
        property,
        url: z.string().url(),
        languageCode: z.string().min(2).max(35).optional(),
      }),
      annotations,
    },
    async (input) => observed("gsc_url_inspection", () => createGscClientFromEnv().inspectUrl(input.property, input.url, input.languageCode)),
  );

  server.registerTool(
    "gsc_list_sitemaps",
    {
      title: "List sitemaps",
      description: "Read sitemap submission and processing status for an accessible Search Console property. Does not submit or delete sitemaps.",
      inputSchema: z.object({ property, sitemapIndex: z.string().url().optional() }),
      annotations,
    },
    async (input) => observed("gsc_list_sitemaps", () => createGscClientFromEnv().listSitemaps(input.property, input.sitemapIndex)),
  );

  server.registerTool(
    "gsc_period_comparison",
    {
      title: "Compare two Search Console periods",
      description: "Compare baseline Period A with Period B overall or by selected dimensions. All changes are B minus A; a positive position change means ranking deterioration. Use page or query dimensions to find losses and gains.",
      inputSchema: z.object({
        property,
        periodA: period,
        periodB: period,
        dimensions: z.array(dimension).max(3).default([]),
        filters: z.array(filter).max(10).optional(),
        searchType: searchType.default("web"),
        dataState: dataState.default("final"),
        rowLimit: z.number().int().min(1).max(1000).default(500),
        sortBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
        sortDirection: z.enum(["asc", "desc"]).default("asc"),
      }),
      annotations,
    },
    async (input) => observed("gsc_period_comparison", async () => {
      const client = createGscClientFromEnv();
      const common = {
        property: input.property,
        dimensions: input.dimensions,
        filters: input.filters,
        searchType: input.searchType,
        dataState: input.dataState,
        rowLimit: input.rowLimit,
      };
      const [a, b] = await Promise.all([
        client.searchAnalytics({ ...common, ...input.periodA }),
        client.searchAnalytics({ ...common, ...input.periodB }),
      ]);
      const comparison = compareSearchPeriods(a, b);
      const factor = input.sortDirection === "asc" ? 1 : -1;
      comparison.rows.sort(
        (left, right) =>
          (left[input.sortBy].absoluteChange - right[input.sortBy].absoluteChange) * factor,
      );
      return comparison;
    }),
  );
}
