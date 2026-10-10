# Changelog

## Unreleased — SEO Intelligence MCP V1 (source-only; not deployed)

- Five new read-only, data-backed SEO tools for search-query opportunities, property-specific impression trends, existing-page priority and single-URL editorial briefs.
- An optional disabled-by-default Sitemap submission operation inside the same MCP, with separate Google service account, password, client OAuth write scope, exact property allowlist and confirmation.
- No Google Trends alpha API bypass, competitor ranking fabrication, ordinary article Indexing API use, credential distribution, production activation or auto-publishing.
- Added mocked tests and [SEO_INTELLIGENCE.md](SEO_INTELLIGENCE.md) usage/setup guide.


All notable changes to this project will be documented here.

The format is based on Keep a Changelog and the project uses semantic versioning for public releases.

## [0.1.0] - 2026-09-02

### Added

- Read-only Google Search Console MCP gateway with seven tools:
  - property listing;
  - Search Analytics queries;
  - query performance;
  - page performance;
  - URL Inspection;
  - sitemap listing;
  - period comparison.
- Standards-based remote MCP endpoint.
- OAuth authorization boundary with PKCE S256, short-lived authorization codes, signed access tokens, refresh-token rotation, and Redis-backed state/rate limits.
- Service-account authentication to Google Search Console using the `webmasters.readonly` scope.
- Secret-safe logging and normalized Google error handling.
- Mocked automated tests that do not consume Search Console quota.
- CI validation covering lint, TypeScript, tests, and production build.
- Deployment and client setup documentation.
- Apache License 2.0 and contribution guidance for the public open-source release.

### Security

- No Search Console property, sitemap, indexing, content, repository, or deployment mutation tools are exposed.
- Deployment credentials are server-only and excluded from source control.

### Known limitations

- The bundled authorization server is designed for a small/single-operator deployment, not enterprise identity management.
- A live deployment requires operator-provided deployment secrets and explicit Search Console property access for the service account.
- No public adoption, download, or performance claims are made in this initial release.
