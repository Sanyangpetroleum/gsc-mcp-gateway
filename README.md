# GSC SEO Intelligence MCP Gateway

A reusable, **read-only by default** Google Search Console SEO intelligence service exposed through standard remote MCP. It provides evidence-based keyword, page and trend recommendations across accessible properties, with a separately gated optional Sitemap submission tool, with keyless Google writer support. One backend can serve ChatGPT, Codex, Claude, and other OAuth-capable MCP clients without exposing Google credentials to those clients.

## Why this project exists

Search Console integrations often mix provider credentials, local token files, broad OAuth scopes, and client-specific transport logic. GSC MCP Gateway keeps those concerns behind one narrow server boundary:

- MCP clients authenticate to the gateway;
- the gateway authenticates to Google Search Console;
- Google credentials never need to be distributed to individual AI clients;
- the original Google credential and default tool surface remain read-only; an optional Sitemap write capability requires a separate Google identity, OAuth scope, consent password, exact property allowlist and explicit activation.

## Status

**v0.1.0 — initial open-source release candidate.**

The implementation, documentation, mocked tests, and CI workflow are present. A live deployment still requires Google identity federation (preferred), Google Search Console property access, and durable OAuth storage. See [SETUP.md](SETUP.md).

No public adoption, download, or performance claims are made for this initial release.

## Tools

| Tool | Purpose |
|---|---|
| `gsc_list_properties` | List Search Console properties available to the service account |
| `gsc_search_analytics` | Run bounded Search Analytics queries |
| `gsc_query_performance` | Analyze query-level performance |
| `gsc_page_performance` | Analyze page-level performance |
| `gsc_url_inspection` | Read indexed URL Inspection results |
| `gsc_list_sitemaps` | List sitemaps |
| `gsc_sitemap_readiness` | Inspect exact sitemap registration, last submission/download, and writer readiness (read-only) |
| `gsc_url_hygiene_check` | Detect invisible URL characters such as U+2060 before Google inspection (read-only) |
| `gsc_period_comparison` | Compare Search Analytics periods |
| `gsc_keyword_opportunities` | Evidence-based query/page keyword opportunities and buyer intent |
| `gsc_search_trend_signals` | Rising/falling own-property search impression signals |
| `gsc_site_opportunities` | Existing page improvement priorities using two periods |
| `gsc_page_editorial_brief` | Page-specific query, performance and indexed-version recommendations |
| `gsc_seo_priority_brief` | One-call top keyword, trend and existing-page action recommendations |
| `gsc_submit_sitemap` (opt-in only) | Submit an exact allowlisted XML Sitemap using a separate write Google identity and OAuth scope |

The fourteen default tools are read-only. The optional, disabled-by-default `gsc_submit_sitemap` has a separate privileged boundary and cannot request indexing, mutate users/properties/content, or deploy anything. No live global Google Trends, search volumes or competitor SERP data are implied. See [SEO_INTELLIGENCE.md](SEO_INTELLIGENCE.md).

## Security model

- Default Google access uses `https://www.googleapis.com/auth/webmasters.readonly` only. Optional Sitemap-only submission uses a **distinct** service account, `webmasters` scope and independent authorization, disabled by default.
- Anonymous MCP requests are rejected.
- PKCE S256 is required for authorization.
- Authorization codes are short-lived and one-time use.
- Access tokens are audience-bound and short-lived; refresh tokens rotate.
- OAuth state and rate limits use durable Redis-backed storage for remote deployments.
- Google credentials, gateway secrets, query inputs, tokens, and private keys are excluded from logs.
- Common local credential/token files and `.env*` files are excluded from source control.

Read [SECURITY.md](SECURITY.md) before changing authentication, OAuth, logging, Google scopes, or deployment configuration.

## Quick start

Requirements: Node.js 22.x and npm.

```bash
npm ci
npm run check
```

`npm run check` runs linting, TypeScript checks, the mocked test suite, and the production build. Tests mock Google's APIs and do not consume Search Console quota.

For deployment, see [SETUP.md](SETUP.md). For client configuration, see [CLIENTS.md](CLIENTS.md).

## Architecture and design notes

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [SECURITY.md](SECURITY.md)
- [SETUP.md](SETUP.md)
- [CLIENTS.md](CLIENTS.md)
- [AUTH_STORAGE_DECISION.md](AUTH_STORAGE_DECISION.md)
- [IMPLEMENTATION_AUDIT.md](IMPLEMENTATION_AUDIT.md)

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and keep the read-only security boundary intact unless a broader design change is explicitly accepted by the maintainers.

## Releases

See [CHANGELOG.md](CHANGELOG.md). The first public release is `v0.1.0`.

## License

Apache License 2.0. See [LICENSE](LICENSE).
