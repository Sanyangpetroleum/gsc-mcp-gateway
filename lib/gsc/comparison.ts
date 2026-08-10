import type { SearchAnalyticsResult, SearchAnalyticsRow, SearchDimension } from "./types";

export interface ComparedMetric {
  periodA: number;
  periodB: number;
  absoluteChange: number;
  percentChange: number | null;
}

function metric(periodA: number, periodB: number): ComparedMetric {
  return {
    periodA,
    periodB,
    absoluteChange: periodB - periodA,
    percentChange: periodA === 0 ? null : ((periodB - periodA) / periodA) * 100,
  };
}

function rowKey(row: SearchAnalyticsRow, dimensions: SearchDimension[]) {
  return dimensions.map((dimension) => row.dimensions[dimension] ?? "").join("\u001f");
}

function zeroRow(dimensions: SearchDimension[], values: Record<string, string>): SearchAnalyticsRow {
  return { dimensions: Object.fromEntries(dimensions.map((d) => [d, values[d] ?? ""])), clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

export function compareSearchPeriods(
  periodA: SearchAnalyticsResult,
  periodB: SearchAnalyticsResult,
) {
  if (JSON.stringify(periodA.dimensions) !== JSON.stringify(periodB.dimensions)) {
    throw new Error("Both periods must use identical dimensions");
  }
  const dimensions = periodA.dimensions;
  const aMap = new Map(periodA.rows.map((row) => [rowKey(row, dimensions), row]));
  const bMap = new Map(periodB.rows.map((row) => [rowKey(row, dimensions), row]));
  const keys = new Set([...aMap.keys(), ...bMap.keys()]);
  const rows = [...keys].map((key) => {
    const a = aMap.get(key);
    const b = bMap.get(key);
    const values = a?.dimensions ?? b?.dimensions ?? {};
    const rowA = a ?? zeroRow(dimensions, values);
    const rowB = b ?? zeroRow(dimensions, values);
    return {
      dimensions: values,
      clicks: metric(rowA.clicks, rowB.clicks),
      impressions: metric(rowA.impressions, rowB.impressions),
      ctr: metric(rowA.ctr, rowB.ctr),
      position: {
        ...metric(rowA.position, rowB.position),
        improvement: rowA.position === 0 || rowB.position === 0 ? null : rowA.position - rowB.position,
      },
    };
  });
  return {
    property: periodA.property,
    periodA: periodA.period,
    periodB: periodB.period,
    changeConvention: "absoluteChange and percentChange are periodB minus periodA; positive position change is deterioration, while positive position.improvement is improvement",
    dimensions,
    rows,
    limitations: [...new Set([...periodA.limitations, ...periodB.limitations])],
  };
}
