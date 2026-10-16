# SEO Intelligence MCP — Operational contract

Status: **source-level V2 upgrade in review; optional sitemap writes disabled in production**, activation not implied. Reuses the original `/mcp` endpoint, Google OAuth client credentials, rate-limited service, GSC client and exact-property access check.

## What an AI client can do immediately after reviewed deployment

All five SEO analysis tools and the two URL/sitemap readiness tools are **read-only**; they require only existing `gsc.read` gateway OAuth and `webmasters.readonly` Google service-account scope.

| MCP tool | Bounded inputs / real output |
| --- | --- |
| `gsc_keyword_opportunities` | Query/page rows from the accessible property, buyer-intent classification, ranking-range heuristics and an editorial next step |
| `gsc_search_trend_signals` | Compare two non-overlapping equally long *finalized* GSC periods; rising/falling/newly-observed own-property query impressions |
| `gsc_site_opportunities` | Compare own-property page performance across two equal windows, prioritize existing pages for investigation |
| `gsc_page_editorial_brief` | Page-level performance, top visible queries, optional indexed-version Google URL Inspection and a short editorial checklist |
| `gsc_seo_priority_brief` | Combined priority brief in one call: page updates, commercial query opportunities, rising own-property terms and a distinct-topic validation hypothesis |

The original seven Search Console tools remain present and unchanged.

Use **`gsc_list_properties` first** and provide an exact property identifier. Permissions are checked per tool call. Users must separately grant the read Google service account access to each company property; there is no cross-company joining or automatic access to other websites. An explicit property argument is compulsory.

### Example usage

1. List properties. Select exactly `sc-domain:your-business.example` from the returned properties.
2. For one-call recommendations, use `gsc_seo_priority_brief` with equal-length periods (five bounded GSC analytics calls). For detailed research, ask for `gsc_keyword_opportunities` on the latest 28 finalized days, `minImpressions=20` and `maxItems=15`; review commercial search intent and matching existing page.
3. Ask `gsc_search_trend_signals` for the same exact property and equal-length finalized previous/current periods. State that they represent YOUR site's Search Console impressions, *not* worldwide query growth.
4. Ask `gsc_site_opportunities` for pages losing clicks or gaining impressions. Investigate, don't automatically rewrite.
5. Ask `gsc_page_editorial_brief` for one exact matching canonical URL. If Index Inspection reports an issue, verify the live page manually; inspection is indexed-version only.

Suggested editorial brief format: three highest-evidence existing-page changes, one clearly distinct new content hypothesis only when justified, and one technical-indexing check, each with evidence and commercial consequence. Drafts/website publishing/RFQ mutations are **not** MCP capabilities.

Data warning: GSC Search Analytics returns top rows, anonymizes some queries and calculates average positions. Each tool exposes rowLimit/truncation when relevant. A newly observed row may reflect truncation. The heuristic "buyer intent" detects generic procurement-related vocabulary and is not a trained classifier or proof of a prospective customer. No keyword search-volume, competitor domain ranking or guaranteed revenue estimate is invented.

### Google Trends and external market news

`gsc_search_trend_signals` uses GSC impressions, not the **Google Trends API**. Google's official Trends API remains restricted alpha (https://developers.google.com/search/apis/trends); this code does not bypass that limit or scrape an undocumented API. Competitor SERP data, regulation/market news and global Trends require separate authorized third-party/public evidence; they are not silently described as GSC data. There is **no background scheduler** or invented continuous monitoring in this release.

## Sitemap readiness and optional writer in the same MCP

`gsc_sitemap_readiness(property, sitemapUrl)` is **read-only**. It validates a same-property HTTPS Sitemap URL, reports Google-recorded registration/submission/download state and whether the separate writer is ready. It does not fetch the live sitemap, guarantee a crawl or submit anything.

`gsc_url_hygiene_check(property, url)` is **read-only**. It flags invisible Unicode in copied slugs, including `%E2%81%A0` (U+2060), and returns an exact clean URL suggestion. It does not inspect the live rendering or request indexing.

`gsc_submit_sitemap` remains an **explicit write tool** disabled by default. Activation requires `GSC_SITEMAP_WRITE_ENABLED=true`, an exact `GSC_SITEMAP_WRITE_PROPERTIES` allowlist and distinct `MCP_WRITE_ADMIN_PASSWORD`. Preferred live Vercel gateway setup is `GSC_SITEMAP_WRITE_AUTH_MODE=vercel_oidc` with `GCP_SITEMAP_WRITE_SERVICE_ACCOUNT_EMAIL` referencing a separately approved writer account impersonated through bounded Vercel OIDC federation. The existing reader retains `webmasters.readonly`; only the writer receives `webmasters` scope. Legacy JSON writer is supported only as an explicit fallback.

A write-capable OAuth client must request `gsc.read gsc.sitemaps.write`, pass the distinct writer consent and confirm each exact XML Sitemap submission with `confirm="SUBMIT_SITEMAP"`. No general site/property mutations or ordinary-article indexing API. A registered Sitemap whose content is updated may be discovered on Google's next download without a new submit call.

**Activation gate:** production deploy, Google Cloud API permissions, service-account creation/permission changes, and secure secret configuration remain separately controlled operations. CI and code review alone do not perform them.

Sources:
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- https://developers.google.com/webmaster-tools/v1/sitemaps/submit
- https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
- https://developers.google.com/search/apis/trends
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
