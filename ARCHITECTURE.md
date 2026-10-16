# Architecture

```mermaid
flowchart LR
  GSC["Google Search Console"] -->|"webmasters.readonly"| GW["GSC SEO Intelligence MCP"]
  AUTH["OAuth + Redis"] --> GW
  GW -->|"HTTPS Streamable HTTP /mcp"| CLIENTS["ChatGPT · Claude · Codex · agents"]
```

## Selected design

- **Runtime:** Next.js 16 on Node.js, intended for Vercel serverless deployment.
- **MCP:** `mcp-handler` 2.1 with Streamable HTTP at `/mcp` and stateless compatibility for older MCP clients.
- **Client authentication:** OAuth authorization code flow, PKCE S256, dynamic client registration, one-time authorization codes, rotating refresh tokens, and one-hour signed access tokens.
- **OAuth state:** a durable atomic store is required in remote environments; the initial adapter is Upstash Redis. In-memory state is restricted to tests or explicit local development. See `AUTH_STORAGE_DECISION.md`.
- **Google authentication:** preferred keyless Vercel OIDC → GCP Workload Identity Federation → scoped service-account impersonation with `webmasters.readonly`. Pre-existing JSON credentials remain a legacy fallback; creating new private keys is unnecessary and may be prohibited by organizational policy.
- **Google API access:** direct official REST endpoints for Sites, Search Analytics, URL Inspection, and Sitemaps.

The client OAuth token and Google access token are unrelated credentials at separate trust boundaries. AI clients never receive the service-account key or a Google token.

## Data behavior

Search Analytics dates are inclusive. Results are structured and include the selected dimensions, clicks, impressions, CTR, and average position. Google's API returns top rows, not a guaranteed exhaustive export; the gateway repeats that limitation in every analytics response.

`gsc_period_comparison` treats Period A as the baseline. Absolute change is `B - A`. Percentage change is `null` when A is zero. For average position, a positive absolute change is deterioration, and a separate `improvement` value is `A - B`.

The gateway caps a normal analytics call at 5,000 rows and a comparison at 1,000 rows per period. It supports `startRow` for explicit pagination without encouraging oversized agent responses.

## SEO Intelligence V1 — extension, not a second service

The original gateway and seven Google read-only primitives are retained. Five deterministic analytical tools in `lib/mcp/seo-tools.ts` reuse Search Analytics and URL Inspection. Each result carries period, exact property, top-row/truncation cautions and editorial next steps. No extra tokens, paid APIs, background workers, client Google credentials, Google Trends API or external data scraping.

`lib/gsc/sitemap-write.ts` is a separately permissioned optional operation inside the same MCP handler. The default tools and `GOOGLE_SERVICE_ACCOUNT_JSON` remain strictly read-only; the writer has a distinct Google account with `webmasters` scope (prefer keyless Vercel OIDC), explicit `gsc.sitemaps.write` client OAuth scope, a separate write-password consent flow, exact property allowlist and disable-on-missing-config behavior. It is not a general Google write or URL indexing endpoint.

Source changes alone do not activate write permissions, deploy anything, or enroll properties. See [SEO_INTELLIGENCE.md](SEO_INTELLIGENCE.md) and [SECURITY.md](SECURITY.md).

## GSC V2 compatibility

The existing Vercel OIDC federation can mint tokens for a distinct Sitemap writer service account without widening the reader's scope or introducing a long-lived Google private key. The new read-only sitemap readiness and copied-URL hygiene tools do not require any Google write permission. Sitemap writes remain disabled until the dedicated owner approval and exact-property IAM/OAuth gates are completed.
