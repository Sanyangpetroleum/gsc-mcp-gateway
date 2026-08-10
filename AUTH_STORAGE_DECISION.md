# OAuth state storage decision

## Decision

Keep a durable atomic OAuth state store. Keep Upstash Redis as the initial adapter, but do not provision it until explicitly approved.

Redis is **not** used by Google Search Console queries and does not hold GSC results. It stores only short-lived or hashed gateway authorization state:

- dynamically registered MCP client metadata retained while a connector is in use;
- hashed, two-minute, one-time authorization codes;
- hashed, rotating refresh tokens;
- small OAuth endpoint rate-limit counters.

## Why a shared store is necessary

Vercel functions are stateless and may execute on different instances. OAuth 2.1 requires the authorization server to return tokens only once for a given authorization code. It also requires replay detection through sender-constrained or rotating refresh tokens for public clients. PKCE prevents code interception but does not itself record that a valid code has already been redeemed.

A signed, fully stateless authorization code would therefore allow a second exchange during its validity window. A signed stateless refresh token could rotate cosmetically but could not reliably detect reuse of the previous token. In-memory maps work only in tests and local development; they cannot provide these guarantees remotely.

## Alternatives considered

| Alternative | Result |
|---|---|
| No gateway authentication | Rejected: exposes private GSC data anonymously |
| Static bearer token | Rejected: weaker ChatGPT interoperability, coarse revocation, and client-visible long-lived secret |
| Stateless signed codes/tokens | Rejected: cannot enforce one-time code use or refresh-token replay detection |
| Vercel Runtime Cache | Rejected: cache semantics are not a durable atomic authorization ledger |
| Existing business Supabase project | Rejected: couples shared SEO infrastructure to an unrelated application and expands permissions |
| Hosted OAuth provider | Viable later, but adds a larger identity dependency and still stores state externally |
| Durable Redis/KV | Selected: minimal data model, atomic consume, bounded retention, no GSC data |

The `OAuthStore` interface keeps the service portable: Redis can later be replaced by another durable transactional store without changing MCP tools or Google authentication.
