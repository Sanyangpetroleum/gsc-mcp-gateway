import type { SearchAnalyticsResult } from "@/lib/gsc/types";
import { compareSearchPeriods } from "@/lib/gsc/comparison";
import { validateDateRange } from "@/lib/gsc/validation";

const BUYER_WORDS = /\b(?:supplier|suppliers|wholesale|bulk|distributor|procurement|purchase|buy|buyer|buyers|quote|quotation|rfq|tender|import|importer|export|exporter|fob|cfr|cif|incoterms?|datasheet|pds|tds|coa|sds|msds|specification|specifications|technical|astm|iso\s?\d+)\b/i;
const PRICE_WORDS = /\b(?:price|pricing|cost|rate|rates|per\s?(?:mt|ton|tonne|kg))\b/i;

export const DATA_LIMITATIONS = [
  "Signals measure this property's visible Search Console performance, NOT all Google search demand, Google Trends, competitors, or keyword search volume.",
  "Search Analytics returns top rows; low-volume and anonymized queries may be missing. A new or missing row does not prove an actual change in total search demand.",
  "Search position is an average, not a guaranteed rank. Scores and next steps are editorial heuristics, not Google ranking predictions.",
  "Recent data is finalized only when Google's final dataState is requested; indexing or rankings are never guaranteed.",
];

export function buyerIntent(query: string) {
  if (BUYER_WORDS.test(query)) return "procurement";
  if (PRICE_WORDS.test(query)) return "commercial_research";
  return "informational_or_unknown";
}

function volumeConfidence(impressions: number) {
  return impressions >= 100 ? "moderate" : impressions >= 30 ? "limited" : "low";
}

export function validateComparableWindows(
  periodA: { startDate: string; endDate: string },
  periodB: { startDate: string; endDate: string },
) {
  const a = validateDateRange(periodA.startDate, periodA.endDate);
  const b = validateDateRange(periodB.startDate, periodB.endDate);
  if (a.days !== b.days) throw new Error("Comparison periods must contain the same number of days");
  if (a.end >= b.start) throw new Error("Period A must finish before Period B starts");
}

export function keywordOpportunities(
  data: SearchAnalyticsResult,
  minImpressions = 20,
  maxItems = 15,
) {
  const opportunities = data.rows
    .filter((row) => row.impressions >= minImpressions && row.dimensions.query)
    .map((row) => {
      const query = row.dimensions.query;
      const intent = buyerIntent(query);
      const rankBand = row.position >= 4 && row.position <= 20
        ? "mid_position"
        : row.position > 20 ? "low_visibility" : "visible";
      const lowCtr = row.impressions >= 50 && row.position <= 15 && row.ctr < 0.02;
      const score = Math.round(
        Math.min(45, Math.log10(row.impressions + 1) * 16) +
        (intent === "procurement" ? 25 : intent === "commercial_research" ? 15 : 0) +
        (rankBand === "mid_position" ? 18 : rankBand === "low_visibility" ? 7 : 0) +
        (lowCtr ? 12 : 0),
      );
      const recommendedAction = rankBand === "mid_position"
        ? "Improve the existing matching page's direct answer, evidence, internal links and buyer-specific next step; confirm search intent before rewriting."
        : lowCtr
          ? "Inspect actual search snippets and user intent; review title and summary without promising a ranking gain."
          : "Check whether the existing page satisfies query intent; avoid publishing a near-duplicate article.";
      return {
        query,
        page: row.dimensions.page ?? null,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        averagePosition: row.position,
        intent,
        rankBand,
        evidenceConfidence: volumeConfidence(row.impressions),
        heuristicScore: score,
        recommendedAction,
      };
    })
    .sort((a, b) => b.heuristicScore - a.heuristicScore || b.impressions - a.impressions);
  return {
    property: data.property,
    period: data.period,
    searchType: data.searchType,
    rowsExamined: data.rows.length,
    requestedRowLimit: data.rowLimit,
    sampledTopRowsMayBeTruncated: data.rows.length === data.rowLimit,
    opportunities: opportunities.slice(0, maxItems),
    limitations: DATA_LIMITATIONS,
  };
}

export function searchTrendSignals(
  previous: SearchAnalyticsResult,
  current: SearchAnalyticsResult,
  minCurrentImpressions = 25,
  maxItems = 10,
) {
  validateComparableWindows(previous.period, current.period);
  const comparison = compareSearchPeriods(previous, current);
  const signals = comparison.rows
    .filter((row) => Boolean(row.dimensions.query))
    .map((row) => {
      const baseline = row.impressions.periodA;
      const recent = row.impressions.periodB;
      const change = recent - baseline;
      const ratio = baseline > 0 ? change / baseline : null;
      const direction =
        baseline === 0 && recent >= minCurrentImpressions ? "newly_observed" :
        recent >= minCurrentImpressions && change >= Math.max(15, baseline * 0.35) ? "rising" :
        baseline >= minCurrentImpressions && change <= -Math.max(15, baseline * 0.35) ? "declining" : "stable_or_insufficient";
      return {
        query: row.dimensions.query,
        direction,
        previousImpressions: baseline,
        currentImpressions: recent,
        impressionChange: change,
        impressionChangePercent: ratio === null ? null : Math.round(ratio * 1000) / 10,
        previousClicks: row.clicks.periodA,
        currentClicks: row.clicks.periodB,
        intent: buyerIntent(row.dimensions.query),
        evidenceConfidence: volumeConfidence(Math.max(baseline, recent)),
      };
    })
    .filter((signal) => signal.direction !== "stable_or_insufficient")
    .sort((a, b) => Math.abs(b.impressionChange) - Math.abs(a.impressionChange));
  const select = (direction: string) =>
    signals.filter((signal) => signal.direction === direction).slice(0, maxItems);
  return {
    property: previous.property,
    periodA: previous.period,
    periodB: current.period,
    rowsExamined: { previous: previous.rows.length, current: current.rows.length },
    sampledTopRowsMayBeTruncated: previous.rows.length === previous.rowLimit || current.rows.length === current.rowLimit,
    rising: select("rising"),
    declining: select("declining"),
    newlyObserved: select("newly_observed"),
    terminology: "Property-specific Search Console impression trends, not Google Trends API search-interest statistics.",
    limitations: DATA_LIMITATIONS,
  };
}

export function sitePageOpportunities(
  previous: SearchAnalyticsResult,
  current: SearchAnalyticsResult,
  minImpressions = 30,
  maxItems = 12,
) {
  validateComparableWindows(previous.period, current.period);
  const comparison = compareSearchPeriods(previous, current);
  const entries = comparison.rows
    .filter((row) => Boolean(row.dimensions.page))
    .map((row) => {
      const impressions = row.impressions.periodB;
      const clicksLost = Math.max(0, -row.clicks.absoluteChange);
      const impressionLoss = Math.max(0, -row.impressions.absoluteChange);
      const trend = clicksLost >= 3 && row.clicks.periodA >= 5
        ? "clicks_declining" : impressionLoss >= 25 && row.impressions.periodA >= 50
          ? "impressions_declining" : impressions >= minImpressions && row.position.periodB >= 4 && row.position.periodB <= 20
            ? "existing_page_opportunity" : "monitor";
      return {
        page: row.dimensions.page,
        trend,
        previous: {
          clicks: row.clicks.periodA, impressions: row.impressions.periodA,
          ctr: row.ctr.periodA, position: row.position.periodA,
        },
        current: {
          clicks: row.clicks.periodB, impressions,
          ctr: row.ctr.periodB, position: row.position.periodB,
        },
        clickChange: row.clicks.absoluteChange,
        impressionChange: row.impressions.absoluteChange,
        evidenceConfidence: volumeConfidence(Math.max(row.impressions.periodA, impressions)),
        nextAction: trend === "clicks_declining"
          ? "Investigate query mix, snippets, indexing/canonical, internal links and SERP competition before changing the article."
          : trend === "impressions_declining"
            ? "Check indexed status, content relevance, seasonality and whether queries have shifted."
            : "Prioritize evidence, a clearer top answer, conversion path and relevant internal links on this existing page.",
        heuristicScore: clicksLost * 6 + Math.min(200, impressionLoss) + Math.log10(impressions + 1) * 10,
      };
    })
    .filter((row) => row.trend !== "monitor")
    .sort((a, b) => b.heuristicScore - a.heuristicScore);
  return {
    property: current.property, periodA: previous.period, periodB: current.period,
    rowsExamined: { previous: previous.rows.length, current: current.rows.length },
    opportunities: entries.slice(0, maxItems),
    limitations: DATA_LIMITATIONS,
  };
}

export function pageEditorialBrief(
  pageUrl: string,
  previous: SearchAnalyticsResult,
  current: SearchAnalyticsResult,
  queries: SearchAnalyticsResult,
  indexResult: Record<string, unknown> | null,
) {
  validateComparableWindows(previous.period, current.period);
  const a = previous.rows[0];
  const b = current.rows[0];
  const topQueries = queries.rows
    .filter((r) => r.dimensions.query)
    .sort((left, right) => right.impressions - left.impressions)
    .slice(0, 15)
    .map((r) => ({
      query: r.dimensions.query, clicks: r.clicks, impressions: r.impressions,
      ctr: r.ctr, averagePosition: r.position,
      intent: buyerIntent(r.dimensions.query),
    }));
  const indexing = (indexResult?.indexStatusResult ?? {}) as Record<string, unknown>;
  const actions: string[] = [];
  if (indexing.verdict && indexing.verdict !== "PASS")
    actions.push("Investigate the indexed-version verdict, coverage, Google-selected canonical and robots before editorial changes.");
  if ((b?.impressions ?? 0) >= 30 && (b?.position ?? 0) >= 4 && (b?.position ?? 0) <= 20)
    actions.push("Improve this existing page's answer, supporting evidence, internal links and buyer-specific next step; do not add a near-duplicate.");
  if ((b?.clicks ?? 0) + 3 < (a?.clicks ?? 0))
    actions.push("Check whether losses come from search intent shifts, declining impressions or CTR; do not assume a technical indexing fault.");
  if (topQueries.some((q) => q.intent === "procurement"))
    actions.push("Make specification, documentation, location and qualification requirements easy to find; tie any RFQ to verified commercial capability.");
  if (!actions.length)
    actions.push("Monitor the existing content; use verified page/source evidence before creating a new post.");
  return {
    property: current.property,
    pageUrl,
    periodA: previous.period,
    periodB: current.period,
    previous: a ? { clicks: a.clicks, impressions: a.impressions, ctr: a.ctr, position: a.position } : null,
    current: b ? { clicks: b.clicks, impressions: b.impressions, ctr: b.ctr, position: b.position } : null,
    topQueries,
    indexedVersion: indexResult
      ? {
          verdict: indexing.verdict ?? null,
          coverageState: indexing.coverageState ?? null,
          googleCanonical: indexing.googleCanonical ?? null,
          userCanonical: indexing.userCanonical ?? null,
          robotsTxtState: indexing.robotsTxtState ?? null,
        }
      : null,
    recommendedChecks: actions,
    limitations: [
      ...DATA_LIMITATIONS,
      "This tool does not fetch live HTML, audit the current article copy, or verify commercial stock or supplier claims.",
      "URL Inspection describes Google's indexed version only and is not a Request Indexing action.",
    ],
  };
}

export function combinedSeoPriorityBrief(
  keywords: ReturnType<typeof keywordOpportunities>,
  trends: ReturnType<typeof searchTrendSignals>,
  pages: ReturnType<typeof sitePageOpportunities>,
) {
  if (keywords.property !== trends.property || trends.property !== pages.property) {
    throw new Error("Cannot combine SEO evidence from different Search Console properties");
  }
  const risingBuyerQuery = [...trends.rising, ...trends.newlyObserved]
    .find((signal) => signal.intent === "procurement" || signal.intent === "commercial_research");
  return {
    property: keywords.property,
    periodA: trends.periodA,
    periodB: trends.periodB,
    executivePriority: "Improve existing proven pages and their qualified enquiry paths before creating new overlapping posts.",
    existingPagesToReview: pages.opportunities.slice(0, 3),
    commercialQueriesToStrengthen: keywords.opportunities
      .filter((entry) => entry.intent !== "informational_or_unknown").slice(0, 5),
    risingSearchInterestsOnThisProperty: trends.rising.slice(0, 3),
    decliningSearchInterestsOnThisProperty: trends.declining.slice(0, 3),
    distinctArticleHypothesisToValidate: risingBuyerQuery
      ? {
          observedQuery: risingBuyerQuery.query,
          currentImpressions: risingBuyerQuery.currentImpressions,
          nextStep: "Check all existing canonical pages and approved commercial/technical evidence for this query first. Only propose a distinct new post if search intent is underserved.",
        }
      : null,
    technicalIndexingNextStep: "Use gsc_page_editorial_brief on the highest-value affected page to inspect Google's indexed canonical and coverage state before any technical diagnosis.",
    operationalBoundaries: {
      automaticPublishing: false,
      googleTrendsApiUsed: false,
      competitorRanksMeasured: false,
      scheduledMonitoringConfigured: false,
      inquiryRevenueMeasured: false,
    },
    coverage: {
      keywordRowsExamined: keywords.rowsExamined,
      trendRowsExamined: trends.rowsExamined,
      pageRowsExamined: pages.rowsExamined,
      keywordSampleTruncated: keywords.sampledTopRowsMayBeTruncated,
      trendSampleTruncated: trends.sampledTopRowsMayBeTruncated,
    },
    limitations: DATA_LIMITATIONS,
  };
}
