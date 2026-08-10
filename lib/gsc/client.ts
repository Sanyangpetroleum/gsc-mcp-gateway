import { GoogleAuth } from "google-auth-library";
import { requiredEnv } from "@/lib/config";
import { GoogleApiError, toGoogleApiError } from "./errors";
import { GSC_SCOPE, type SearchAnalyticsRequest, type SearchAnalyticsResult } from "./types";
import { validateInspectionUrl, validateSearchRequest } from "./validation";

type FetchLike = typeof fetch;
type TokenProvider = () => Promise<string>;

const WEBMASTERS_BASE = "https://www.googleapis.com/webmasters/v3";
const INSPECTION_URL = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class GscClient {
  private propertiesCache?: { expiresAt: number; entries: Array<Record<string, unknown>> };

  constructor(
    private readonly tokenProvider: TokenProvider,
    private readonly fetcher: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async request<T>(url: string, init: RequestInit = {}, attempt = 0): Promise<T> {
    const token = await this.tokenProvider();
    const response = await this.fetcher(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      const error = await toGoogleApiError(response);
      if ((error.category === "quota" || error.category === "transient") && attempt < 2) {
        const backoff = (error.retryAfterSeconds ?? 2 ** attempt) * 1000;
        await wait(Math.min(backoff, 5000));
        return this.request<T>(url, init, attempt + 1);
      }
      throw error;
    }
    if (response.status === 204) return {} as T;
    return (await response.json()) as T;
  }

  async listProperties(force = false) {
    if (!force && this.propertiesCache && this.propertiesCache.expiresAt > this.now()) {
      return this.propertiesCache.entries;
    }
    const data = await this.request<{ siteEntry?: Array<Record<string, unknown>> }>(
      `${WEBMASTERS_BASE}/sites`,
    );
    const entries = data.siteEntry ?? [];
    this.propertiesCache = { expiresAt: this.now() + 300_000, entries };
    return entries;
  }

  async assertPropertyAccess(property: string) {
    const properties = await this.listProperties();
    if (!properties.some((entry) => entry.siteUrl === property)) {
      throw new GoogleApiError(
        "The Google identity does not have access to the exact Search Console property supplied",
        403,
        "permission",
      );
    }
  }

  async searchAnalytics(input: SearchAnalyticsRequest): Promise<SearchAnalyticsResult> {
    validateSearchRequest(input);
    await this.assertPropertyAccess(input.property);
    const dimensions = input.dimensions ?? [];
    const rowLimit = input.rowLimit ?? 100;
    const startRow = input.startRow ?? 0;
    const searchType = input.searchType ?? "web";
    const dataState = input.dataState ?? "final";
    const body: Record<string, unknown> = {
      startDate: input.startDate,
      endDate: input.endDate,
      dimensions,
      type: searchType,
      dataState,
      rowLimit,
      startRow,
      aggregationType: "auto",
    };
    if (input.filters?.length) {
      body.dimensionFilterGroups = [{ groupType: "and", filters: input.filters }];
    }
    const response = await this.request<{
      rows?: Array<{
        keys?: string[];
        clicks?: number;
        impressions?: number;
        ctr?: number;
        position?: number;
      }>;
      responseAggregationType?: string;
      metadata?: Record<string, unknown>;
    }>(
      `${WEBMASTERS_BASE}/sites/${encodeURIComponent(input.property)}/searchAnalytics/query`,
      { method: "POST", body: JSON.stringify(body) },
    );
    const rows = (response.rows ?? []).map((row) => ({
      dimensions: Object.fromEntries(dimensions.map((dimension, index) => [dimension, row.keys?.[index] ?? ""])),
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    }));
    return {
      property: input.property,
      period: { startDate: input.startDate, endDate: input.endDate },
      dimensions,
      searchType,
      dataState,
      rowCount: rows.length,
      startRow,
      rowLimit,
      rows,
      responseAggregationType: response.responseAggregationType,
      metadata: response.metadata,
      limitations: [
        "Search Analytics returns top rows rather than a guaranteed exhaustive export.",
        "Recent data may be incomplete when dataState is all or hourly_all.",
      ],
    };
  }

  async inspectUrl(property: string, inspectionUrl: string, languageCode?: string) {
    validateInspectionUrl(property, inspectionUrl);
    await this.assertPropertyAccess(property);
    const body: Record<string, string> = { siteUrl: property, inspectionUrl };
    if (languageCode) body.languageCode = languageCode;
    const result = await this.request<{ inspectionResult?: Record<string, unknown> }>(INSPECTION_URL, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      property,
      inspectionUrl,
      inspectionResult: result.inspectionResult ?? null,
      limitation: "This inspects the version in Google's index; it is not a live URL test.",
    };
  }

  async listSitemaps(property: string, sitemapIndex?: string) {
    await this.assertPropertyAccess(property);
    const url = new URL(`${WEBMASTERS_BASE}/sites/${encodeURIComponent(property)}/sitemaps`);
    if (sitemapIndex) url.searchParams.set("sitemapIndex", sitemapIndex);
    const result = await this.request<{ sitemap?: Array<Record<string, unknown>> }>(url.toString());
    return { property, count: result.sitemap?.length ?? 0, sitemaps: result.sitemap ?? [] };
  }
}

let sharedClient: GscClient | undefined;

export function createGscClientFromEnv(): GscClient {
  if (sharedClient) return sharedClient;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(
      Buffer.from(requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64"), "base64").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    throw new Error("Required server configuration is invalid: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  }
  if (parsed.type !== "service_account" || !parsed.client_email || !parsed.private_key) {
    throw new Error("Required server configuration is invalid: GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  }
  const auth = new GoogleAuth({ credentials: parsed, scopes: [GSC_SCOPE] });
  const tokenProvider = async () => {
    const client = await auth.getClient();
    const response = await client.getAccessToken();
    if (!response.token) throw new Error("Google Search Console authentication failed");
    return response.token;
  };
  sharedClient = new GscClient(tokenProvider);
  return sharedClient;
}

export function resetSharedGscClientForTests() {
  sharedClient = undefined;
}
