import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createGscClientFromEnv } from "@/lib/gsc/client";
import { safeToolError } from "@/lib/gsc/errors";
import { validateInspectionUrl } from "@/lib/gsc/validation";
import {
  keywordOpportunities, searchTrendSignals, sitePageOpportunities,
  pageEditorialBrief, validateComparableWindows,
} from "@/lib/seo/analysis";

const property = z.string().min(1).max(2048);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const period = z.object({ startDate: date, endDate: date });
const searchType = z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web");
const country = z.string().regex(/^[A-Za-z]{3}$/).optional();
const annotations = {
  readOnlyHint: true, destructiveHint: false,
  idempotentHint: true, openWorldHint: true,
};

async function respond(tool: string, action: () => Promise<unknown>) {
  const started = Date.now();
  try {
    const data = await action();
    console.info(JSON.stringify({
      event: "mcp_tool", tool, success: true,
      timestamp: new Date().toISOString(), latencyMs: Date.now() - started,
      googleStatusCategory: "success",
    }));
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
      structuredContent: data as Record<string, unknown>,
    };
  } catch (error) {
    const safe = safeToolError(error);
    console.warn(JSON.stringify({
      event: "mcp_tool", tool, success: false,
      timestamp: new Date().toISOString(), latencyMs: Date.now() - started,
      googleStatusCategory: safe.googleStatusCategory ?? "not_called",
      errorCode: safe.code,
    }));
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: safe }) }],
      structuredContent: { error: safe },
    };
  }
}

function filtersFor(countryCode?: string, page?: string) {
  return [
    ...(countryCode ? [{
      dimension: "country" as const, operator: "equals" as const,
      expression: countryCode.toLowerCase(),
    }] : []),
    ...(page ? [{
      dimension: "page" as const, operator: "equals" as const, expression: page,
    }] : []),
  ];
}

export function registerSeoTools(server: McpServer) {
  server.registerTool(
    "gsc_keyword_opportunities",
    {
      title: "Evidence-based SEO keyword opportunities",
      description: "Prioritize buyer-intent search queries and their existing matching pages using this property's observed Google Search Console impressions, CTR and average position. No fabricated search volume, competitive difficulty, or AI publishing.",
      inputSchema: z.object({
        property, startDate: date, endDate: date, searchType,
        country, page: z.string().url().max(2048).optional(),
        minImpressions: z.number().int().min(10).max(1000).default(20),
        rowLimit: z.number().int().min(50).max(2000).default(1000),
        maxItems: z.number().int().min(1).max(30).default(15),
      }),
      annotations,
    },
    async (input) => respond("gsc_keyword_opportunities", async () => {
      if (input.page) validateInspectionUrl(input.property, input.page);
      const response = await createGscClientFromEnv().searchAnalytics({
        property: input.property, startDate: input.startDate, endDate: input.endDate,
        searchType: input.searchType, dataState: "final", dimensions: ["query", "page"],
        filters: filtersFor(input.country, input.page), rowLimit: input.rowLimit,
      });
      return keywordOpportunities(response, input.minImpressions, input.maxItems);
    }),
  );

  server.registerTool(
    "gsc_search_trend_signals",
    {
      title: "Rising and declining property-specific search queries",
      description: "Compare equal-length finalized Search Console periods. Trends measure your OWN site's impressions, not global Google Trends search interest or competitor rankings. Use completed dates with sufficient data.",
      inputSchema: z.object({
        property, periodA: period, periodB: period, searchType,
        country, page: z.string().url().max(2048).optional(),
        minCurrentImpressions: z.number().int().min(10).max(1000).default(25),
        rowLimit: z.number().int().min(50).max(2000).default(1000),
        maxItems: z.number().int().min(1).max(30).default(10),
      }),
      annotations,
    },
    async (input) => respond("gsc_search_trend_signals", async () => {
      validateComparableWindows(input.periodA, input.periodB);
      if (input.page) validateInspectionUrl(input.property, input.page);
      const client = createGscClientFromEnv();
      const common = {
        property: input.property, dimensions: ["query" as const],
        filters: filtersFor(input.country, input.page), rowLimit: input.rowLimit,
        searchType: input.searchType, dataState: "final" as const,
      };
      const [baseline, recent] = await Promise.all([
        client.searchAnalytics({ ...common, ...input.periodA }),
        client.searchAnalytics({ ...common, ...input.periodB }),
      ]);
      return searchTrendSignals(baseline, recent, input.minCurrentImpressions, input.maxItems);
    }),
  );

  server.registerTool(
    "gsc_site_opportunities",
    {
      title: "Prioritize existing pages for SEO improvements",
      description: "Compare two equal-length finalized periods, highlight pages losing clicks or impressions and pages ranking in an actionable range. Recommendations are evidence-linked editorial checks, not live HTML auditing.",
      inputSchema: z.object({
        property, periodA: period, periodB: period, searchType,
        country,
        minImpressions: z.number().int().min(10).max(1000).default(30),
        rowLimit: z.number().int().min(50).max(2000).default(1000),
        maxItems: z.number().int().min(1).max(30).default(12),
      }),
      annotations,
    },
    async (input) => respond("gsc_site_opportunities", async () => {
      validateComparableWindows(input.periodA, input.periodB);
      const client = createGscClientFromEnv();
      const common = {
        property: input.property, dimensions: ["page" as const],
        filters: filtersFor(input.country), rowLimit: input.rowLimit,
        searchType: input.searchType, dataState: "final" as const,
      };
      const [baseline, recent] = await Promise.all([
        client.searchAnalytics({ ...common, ...input.periodA }),
        client.searchAnalytics({ ...common, ...input.periodB }),
      ]);
      return sitePageOpportunities(baseline, recent, input.minImpressions, input.maxItems);
    }),
  );

  server.registerTool(
    "gsc_page_editorial_brief",
    {
      title: "Review a published page's queries, performance and indexing",
      description: "Generate an evidence-based improvement checklist for an EXISTING page, including observed search queries and optional indexed-version Google URL Inspection. Does not fetch HTML, edit content, submit URLs, or publish posts.",
      inputSchema: z.object({
        property, page: z.string().url().max(2048),
        periodA: period, periodB: period, searchType,
        country,
        inspectIndexedVersion: z.boolean().default(true),
      }),
      annotations,
    },
    async (input) => respond("gsc_page_editorial_brief", async () => {
      validateComparableWindows(input.periodA, input.periodB);
      validateInspectionUrl(input.property, input.page);
      const client = createGscClientFromEnv();
      const common = {
        property: input.property, dimensions: [] as [],
        filters: filtersFor(input.country, input.page),
        searchType: input.searchType, dataState: "final" as const,
        rowLimit: 1,
      };
      const [baseline, recent, queries, inspection] = await Promise.all([
        client.searchAnalytics({ ...common, ...input.periodA }),
        client.searchAnalytics({ ...common, ...input.periodB }),
        client.searchAnalytics({
          ...common, ...input.periodB, dimensions: ["query"],
          rowLimit: 250,
        }),
        input.inspectIndexedVersion ? client.inspectUrl(input.property, input.page) : Promise.resolve(null),
      ]);
      return pageEditorialBrief(
        input.page, baseline, recent, queries,
        inspection?.inspectionResult ?? null,
      );
    }),
  );
}
