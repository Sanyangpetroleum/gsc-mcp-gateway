# SEO Intelligence MCP — Operational contract

Status: **source-only implementation**, production activation not implied. Reuses the original `/mcp` endpoint, Google OAuth client credentials, rate-limited service, GSC client and exact-property access check.

## What an AI client can do immediately after reviewed deployment

All four additional tools are **read-only**; they require only existing `gsc.read` gateway OAuth and `webmasters.readonly` Google service-account scope.

| MCP tool | Bounded inputs / real output |
| --- | --- |
| `gsc_keyword_opportunities` | Query/page rows from the accessible property, buyer-intent classification, ranking-range heuristics and an editorial next step |
| `gsc_search_trend_signals` | Compare two non-overlapping equally long *finalized* GSC periods; rising/falling/newly-observed own-property query impressions |
| `gsc_site_opportunities` | Compare own-property page performance across two equal windows, prioritize existing pages for investigation |
| `gsc_page_editorial_brief` | Page-level performance, top visible queries, optional indexed-version Google URL Inspection and a short editorial checklist |

The original seven Search Console tools remain present and unchanged.

Use **`gsc_list_properties` first** and provide an exact property identifier. Permissions are checked per tool call. Users must separately grant the read Google service account access to each company property; there is no cross-company joining or automatic access to other websites. An explicit property argument is compulsory.

### Example usage

1. List properties. Select exactly `sc-domain:your-business.example` from the returned properties.
2. Ask for `gsc_keyword_opportunities` on the latest 28 finalized days, `minImpressions=20` and `maxItems=15`; review commercial search intent and matching existing page.
3. Ask `gsc_search_trend_signals` for the same exact property and equal-length finalized previous/current periods. State that they represent YOUR site's Search Console impressions, *not* worldwide query growth.
4. Ask `gsc_site_opportunities` for pages losing clicks or gaining impressions. Investigate, don't automatically rewrite.
5. Ask `gsc_page_editorial_brief` for one exact matching canonical URL. If Index Inspection reports an issue, verify the live page manually; inspection is indexed-version only.

Suggested editorial brief format: three highest-evidence existing-page changes, one clearly distinct new content hypothesis only when justified, and one technical-indexing check, each with evidence and commercial consequence. Drafts/website publishing/RFQ mutations are **not** MCP capabilities.

Data warning: GSC Search Analytics returns top rows, anonymizes some queries and calculates average positions. Each tool exposes rowLimit/truncation when relevant. A newly observed row may reflect truncation. The heuristic "buyer intent" detects generic procurement-related vocabulary and is not a trained classifier or proof of a prospective customer. No keyword search-volume, competitor domain ranking or guaranteed revenue estimate is invented.

### Google Trends and external market news

`gsc_search_trend_signals` uses GSC impressions, not the **Google Trends API**. Google's official Trends API remains restricted alpha (https://developers.google.com/search/apis/trends); this code does not bypass that limit or scrape an undocumented API. Competitor SERP data, regulation/market news and global Trends require separate authorized third-party/public evidence; they are not silently described as GSC data. There is **no background scheduler** or invented continuous monitoring in this release.

## Opt-in write tool in the same MCP (OFF by default)

`gsc_submit_sitemap` is registered **only when ALL of these separate variables are supplied** in secure server environment storage:

- `GSC_SITEMAP_WRITE_ENABLED=true`
- `GSC_SITEMAP_WRITE_PROPERTIES`: comma-separated **exact property IDs** (max 20) that the operator has independently authorized for write, e.g. `sc-domain:your-business.example`.
- `GSC_SITEMAP_WRITE_SERVICE_ACCOUNT_JSON`: **distinct** service account from read-only GSC with `webmasters` scope, granted Google Search Console property access to those exact properties.
- `MCP_WRITE_ADMIN_PASSWORD`: a **distinct** operator approval password from the existing `MCP_ADMIN_PASSWORD`; never paste it into ChatGPT or commit it.

Any missing item disables the tool. Do not broaden the existing read-only `GOOGLE_SERVICE_ACCOUNT_JSON` scope or share credentials with a client. Current GSC properties still must pass the read-only identity's exact access check.

An OAuth client must **explicitly request `gsc.read gsc.sitemaps.write`**, then pass the separate write password in the gateway OAuth consent screen. Existing `gsc.read` tokens, read-password authorizations, and refresh tokens **cannot gain the write scope**. The tool also checks the write scope on every call, checks the allowlist, checks same property membership, requires exact HTTPS `sitemap*.xml[.gz]` URL and `confirm="SUBMIT_SITEMAP"`, then makes one Google `sitemaps.submit` PUT call (no page body). Google credential and private response bodies never enter logs. Revoking the feature flag disables calls even from existing write-scoped tokens.

This write surface is a *Sitemap submission*, not a Google URL Inspection "Request Indexing" automation. Ordinary articles cannot be submitted through Google's restricted Indexing API. Google accepting a Sitemap does not guarantee crawling or indexing.

**Activation gate:** production deploy, Google Cloud API permissions, service-account creation/permission changes, and secure secret configuration remain separately controlled operations. CI and code review alone do not perform them.

Sources:
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- https://developers.google.com/webmaster-tools/v1/sitemaps/submit
- https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect
- https://developers.google.com/search/apis/trends
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
