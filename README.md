# GSC MCP Gateway

A reusable, read-only Google Search Console data service exposed through standard remote MCP. One backend can serve ChatGPT, Codex, Claude, and other OAuth-capable MCP clients without exposing Google credentials to those clients.

## Why this project exists

Search Console integrations often mix provider credentials, local token files, broad OAuth scopes, and client-specific transport logic. GSC MCP Gateway keeps those concerns behind one narrow server boundary:

- MCP clients authenticate to the gateway;
- the gateway authenticates to Google Search Console;
- Google credentials never need to be distributed to individual AI clients;
- the Google scope and tool surface are read-only.

## Status

**v0.1.0 — initial open-source release candidate.**

The implementation, documentation, mocked tests, and CI workflow are present. A live deployment still requires operator-provided deployment secrets and explicit Search Console property access for the service-account email.

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
| `gsc_period_comparison` | Compare Search Analytics periods |

Every tool is annotated read-only. The gateway contains no property, user, sitemap, indexing, content, repository, or deployment mutation capability.

## Security model

- Google access uses `https://www.googleapis.com/auth/webmasters.readonly` only.
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
