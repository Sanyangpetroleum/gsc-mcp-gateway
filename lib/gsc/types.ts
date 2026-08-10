export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export type SearchDimension =
  | "query"
  | "page"
  | "country"
  | "device"
  | "date"
  | "hour"
  | "searchAppearance";

export type SearchType = "web" | "image" | "video" | "news" | "discover" | "googleNews";
export type DataState = "final" | "all" | "hourly_all";
export type FilterOperator =
  | "contains"
  | "equals"
  | "notContains"
  | "notEquals"
  | "includingRegex"
  | "excludingRegex";

export interface SearchFilter {
  dimension: "query" | "page" | "country" | "device" | "searchAppearance";
  operator: FilterOperator;
  expression: string;
}

export interface SearchAnalyticsRequest {
  property: string;
  startDate: string;
  endDate: string;
  dimensions?: SearchDimension[];
  filters?: SearchFilter[];
  searchType?: SearchType;
  dataState?: DataState;
  rowLimit?: number;
  startRow?: number;
}

export interface SearchAnalyticsRow {
  dimensions: Record<string, string>;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsResult {
  property: string;
  period: { startDate: string; endDate: string };
  dimensions: SearchDimension[];
  searchType: SearchType;
  dataState: DataState;
  rowCount: number;
  startRow: number;
  rowLimit: number;
  rows: SearchAnalyticsRow[];
  responseAggregationType?: string;
  metadata?: Record<string, unknown>;
  limitations: string[];
}

export interface GoogleApiErrorShape {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string }>;
  };
}
