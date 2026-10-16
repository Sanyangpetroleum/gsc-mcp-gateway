# Security

## Production Google identity: keyless WIF preferred

Read-only Google Search Console access can use `GSC_AUTH_MODE=vercel_oidc` with a Vercel production OIDC token exchanged through Google STS for impersonated short-lived `webmasters.readonly` credentials. `GCP_PROJECT_NUMBER`, pool/provider IDs and the service-account email are **non-secret identifiers**. The token is obtained from the active Vercel request context (`x-vercel-oidc-token`), not a persistent JSON key, source file, log or web response.

The trust must be explicitly scoped by issuer `https://oidc.vercel.com/sanyangpetroleum`, audience `https://vercel.com/sanyangpetroleum` and the exact `owner:sanyangpetroleum:project:gsc-mcp-gateway:environment:production` subject. The Google Workload Identity User binding should grant only this workload identity access to `gsc-mcp-reader`, not all identities in the pool. The official Google STS verifies the OIDC issuer/audience and configured attribute restrictions; tests never assert successful live access without a completed token exchange.

No administrator should disable the Google `iam.disableServiceAccountKeyCreation` constraint to configure this MCP. Do not create or store a key file when federation is available. The separate `gsc_submit_sitemap` writer remains OFF and is **not** authorized by the read-only WIF grant.

## Default read-only boundary and separately gated Sitemap writes

The default Google scope is `https://www.googleapis.com/auth/webmasters.readonly`. The original seven Search Console tools and five added SEO intelligence tools remain **read-only**. They cannot add/remove properties or users, submit/delete sitemaps, request indexing, edit websites, create PRs or deploy source code.

**Optional one-operation write capability (disabled by default):** `gsc_submit_sitemap` may submit only an XML Sitemap for an exact operator-allowlisted Search Console property. Activation requires `GSC_SITEMAP_WRITE_ENABLED=true`, a distinct keyless WIF writer identity (or an independently approved legacy JSON credential) with Google's `https://www.googleapis.com/auth/webmasters` scope, a nonempty exact `GSC_SITEMAP_WRITE_PROPERTIES` list, and a distinct `MCP_WRITE_ADMIN_PASSWORD`. The writer identity must differ from the read-only Google identity; production WIF uses `GSC_SITEMAP_WRITE_AUTH_MODE=vercel_oidc` and an account-specific `GCP_SITEMAP_WRITE_SERVICE_ACCOUNT_EMAIL`, never the read service account. Both must have access to the property.

The OAuth client must explicitly request `gsc.sitemaps.write` **in addition to** `gsc.read`. Write scope cannot be obtained with the original read authorization password; write consent uses the distinct write password. Tokens without that scope cannot submit even if they connect successfully. Tool execution rechecks feature enablement, exact property, HTTPS XML sitemap path and literal `SUBMIT_SITEMAP` confirmation; no arbitrary URL indexing or body mutation is allowed.

Existing read-only clients are not upgraded silently. OAuth refresh tokens retain only their granted scopes. Turning off the flag blocks existing write tokens too. Google API responses are normalized without logging token, client inputs, property or Sitemap URL in server logs. The caller receives an explicit accepted/failed result; 2xx does NOT mean indexed.

Google's ordinary article Request Indexing button has no supported public API; the restricted Google Indexing API is not enabled. Google Trends alpha is not scraped or represented as available; Search Console trend signals are property-specific impressions, not total market demand. Default Security policy continues to prohibit publishing/website mutation.

Grant read and write identities access only to the intended Search Console property, with no Google Cloud IAM roles beyond their needed setup. Do not modify existing `GOOGLE_SERVICE_ACCOUNT_JSON` or widen its scopes. See [SEO_INTELLIGENCE.md](SEO_INTELLIGENCE.md) for setup and scope boundaries.

**Keyless writer:** When enabled on the existing Vercel OIDC deployment, only the separately approved writer account is impersonated and granted `webmasters`. The reader remains `webmasters.readonly`. Full Search Console property access and specific IAM WIF bindings require explicit human authorization; merely adding source code does not grant those permissions.

## Client-to-gateway authentication

- Anonymous MCP requests are rejected with OAuth protected-resource discovery metadata.
- Authorization requires the operator password in `MCP_ADMIN_PASSWORD`.
- PKCE S256 is mandatory.
- Authorization codes expire after two minutes and can be consumed once.
- Access tokens are signed with HS256, audience-bound to `/mcp`, and expire after one hour.
- Refresh tokens expire after 30 days and rotate on every use.
- Dynamic client registrations remain valid while the connector is in use, as expected by current MCP clients; clearing the OAuth store invalidates them.
- Registration, authorization, and token endpoints have Redis-backed rate limits.
- Redirect URIs must use HTTPS, except loopback addresses for local native clients.

This is a small single-operator authorization server. It does not implement enterprise identities, per-property grants, account recovery, or CIMD. Use a managed identity provider before granting access to a broader team.

## Secret handling

Required secrets belong in deployment secret storage and never in source control:

- `GOOGLE_SERVICE_ACCOUNT_JSON` or its base64 alternative
- `MCP_TOKEN_SIGNING_SECRET`
- `MCP_ADMIN_PASSWORD`
- `UPSTASH_REDIS_REST_TOKEN`

The `.gitignore` rejects common credential and token filenames. Error responses normalize Google failures and never include Google's response body, access token, private key, request authorization header, or gateway password.

Rotate a compromised secret by replacing it in the deployment environment and redeploying. Rotating `MCP_TOKEN_SIGNING_SECRET` immediately invalidates access tokens. Rotate the Google key in Google Cloud, update the deployment secret, verify, and then disable/delete the old key.

## Logging

Logs contain only tool or protocol method, UTC timestamp, success/failure, latency, a coarse Google status category, and a safe error code. Tool inputs, query text, URLs, properties, headers, tokens, keys, and full Google errors are excluded.

## Operational limitations

- A downloadable service-account JSON key is a long-lived credential. Restrict deploy access and consider Google Workload Identity Federation as a later hardening step if the hosting/runtime path is validated.
- The shared operator password authorizes every connected MCP client; it is not a multi-tenant policy system.
- Application rate limits reduce abuse but do not replace provider firewall controls or deployment-account MFA.
- Revoking a client currently means rotating the operator password and/or token signing key; there is no client administration console.

## Restricted post-deployment GSC submission (disabled by default)

The optional `POST /api/sitemap-sync` handler is available only when `GSC_SITEMAP_AUTO_SUBMIT_ENABLED=true` **and** the separately permissioned Sitemap writer is enabled. It checks a signed GitHub Actions OIDC JWT via the issuer's JWKS, exact audience, repository name **and immutable ID**, exact main-branch push ref, and exact `cloudflare-production.yml` workflow reference. It accepts no property, URL or Google credential from the HTTP caller: both property and Sitemap URL are fixed in the gateway's server-only allowlist.

The website release job requests a short-lived GitHub OIDC JWT only after an accepted Cloudflare deploy and a Sitemap source change. It does not receive a Google service-account key, Google OAuth token or privileged MCP session. Logs include only coarse success/failure, never tokens or URL arguments. The path must not be enabled without Founder consent and separate security review.
