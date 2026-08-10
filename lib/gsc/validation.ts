import type { SearchAnalyticsRequest } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDate(value: string, field: string): Date {
  if (!ISO_DATE.test(value)) throw new Error(`${field} must use YYYY-MM-DD format`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field} is not a valid calendar date`);
  }
  return date;
}

export function validateDateRange(startDate: string, endDate: string) {
  const start = parseIsoDate(startDate, "startDate");
  const end = parseIsoDate(endDate, "endDate");
  if (start > end) throw new Error("startDate must be on or before endDate");
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  if (days > 500) throw new Error("Date range cannot exceed 500 days");
  return { start, end, days };
}

export function validateProperty(property: string) {
  if (!property || property.length > 2048) throw new Error("property is required");
  if (property.startsWith("sc-domain:")) {
    const domain = property.slice("sc-domain:".length);
    if (!domain || domain.includes("/") || /\s/.test(domain)) {
      throw new Error("Invalid domain property format");
    }
    return;
  }
  let url: URL;
  try {
    url = new URL(property);
  } catch {
    throw new Error("property must be an exact GSC URL-prefix or sc-domain property");
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error("property must use http or https");
  }
}

export function validateSearchRequest(input: SearchAnalyticsRequest) {
  validateProperty(input.property);
  validateDateRange(input.startDate, input.endDate);
  const dimensions = input.dimensions ?? [];
  if (new Set(dimensions).size !== dimensions.length) {
    throw new Error("dimensions cannot contain duplicates");
  }
  if ((input.dataState ?? "final") === "hourly_all" && !dimensions.includes("hour")) {
    throw new Error("dataState hourly_all requires the hour dimension");
  }
  const rowLimit = input.rowLimit ?? 100;
  if (!Number.isInteger(rowLimit) || rowLimit < 1 || rowLimit > 5000) {
    throw new Error("rowLimit must be an integer between 1 and 5000");
  }
  const startRow = input.startRow ?? 0;
  if (!Number.isInteger(startRow) || startRow < 0) {
    throw new Error("startRow must be a non-negative integer");
  }
  if ((input.filters?.length ?? 0) > 10) throw new Error("At most 10 filters are allowed");
  for (const filter of input.filters ?? []) {
    if (!filter.expression || filter.expression.length > 4096) {
      throw new Error("Each filter expression must contain 1 to 4096 characters");
    }
  }
}

export function validateInspectionUrl(property: string, inspectionUrl: string) {
  validateProperty(property);
  let url: URL;
  try {
    url = new URL(inspectionUrl);
  } catch {
    throw new Error("url must be fully qualified");
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("url must use http or https");
  if (property.startsWith("sc-domain:")) {
    const propertyHost = property.slice("sc-domain:".length).toLowerCase();
    const host = url.hostname.toLowerCase();
    if (host !== propertyHost && !host.endsWith(`.${propertyHost}`)) {
      throw new Error("url is not under the supplied domain property");
    }
  } else if (!inspectionUrl.startsWith(property)) {
    throw new Error("url is not under the supplied URL-prefix property");
  }
}
