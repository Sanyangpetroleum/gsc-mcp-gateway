# GSC MCP Gateway

A reusable, read-only Google Search Console data service exposed through standard remote MCP. One backend can serve ChatGPT, Claude, Codex, and other OAuth-capable MCP clients without exposing Google credentials to those clients.

## Status

The implementation and mocked test suite are complete. A live deployment still requires deployment secrets and granting the service-account email read access to the intended Search Console properties.

## Tools

- `gsc_list_properties`
- `gsc_search_analytics`
- `gsc_query_performance`
- `gsc_page_performance`
- `gsc_url_inspection`
- `gsc_list_sitemaps`
- `gsc_period_comparison`

Every tool is annotated read-only. The gateway contains no property, user, sitemap, indexing, content, repository, or deployment mutation capability.

## Local validation

```bash
npm ci
npm run check
```

Tests mock Google's APIs and do not consume Search Console quota.

See [ARCHITECTURE.md](ARCHITECTURE.md), [SECURITY.md](SECURITY.md), [SETUP.md](SETUP.md), [CLIENTS.md](CLIENTS.md), and [IMPLEMENTATION_AUDIT.md](IMPLEMENTATION_AUDIT.md).
