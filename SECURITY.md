# Security

## Read-only boundary

The only Google scope is:

```text
https://www.googleapis.com/auth/webmasters.readonly
```

The service exposes only list/query/inspect operations. It cannot add or remove properties or users, submit or delete sitemaps, request indexing, modify websites, edit SEO content, create pull requests, or deploy code. The Google Indexing API is not enabled or used.

Grant the service account **Full user** access to only the required Search Console properties; do not make it an owner. Search Console permission and the OAuth scope both constrain access.

## Client-to-gateway authentication

- Anonymous MCP requests are rejected with OAuth protected-resource discovery metadata.
- Authorization requires the operator password in `MCP_ADMIN_PASSWORD`.
- PKCE S256 is mandatory.
- Authorization codes expire after two minutes and can be consumed once.
- Access tokens are signed with HS256, audience-bound to `/mcp`, and expire after one hour.
- Refresh tokens expire after 30 days and rotate on every use.
- Dynamic client registrations expire after one year.
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
