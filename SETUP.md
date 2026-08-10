# Deployment setup

These are the only administrator steps needed after the code is deployed.

## 1. Google identity

1. In a dedicated Google Cloud project, enable **Google Search Console API**.
2. Create a dedicated service account with no Google Cloud project role beyond what account creation requires. Create one JSON key.
3. In each intended Search Console property, open **Settings → Users and permissions → Add user**. Add the service account's `client_email` as **Full user**, not owner.
4. Base64-encode the JSON file as one line and store it as `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` in the deployment secret store. Delete the local downloaded copy after successful validation.

The service account does not gain Search Console data from an IAM role; the explicit Search Console property grant is the important permission.

## 2. Gateway OAuth state and secrets

Provision one Upstash Redis database in the same Vercel account/region. Store these server-only environment variables:

| Variable | Purpose |
|---|---|
| `PUBLIC_BASE_URL` | Exact HTTPS origin, with no trailing slash |
| `MCP_TOKEN_SIGNING_SECRET` | At least 32 random bytes, base64url-encoded |
| `MCP_ADMIN_PASSWORD` | Strong unique operator authorization password |
| `UPSTASH_REDIS_REST_URL` | Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST secret |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Base64 of the complete service-account JSON |

Do not set `ALLOW_IN_MEMORY_OAUTH` on a remote deployment.

## 3. Deploy and verify

Deploy as a Vercel Next.js project on Node.js 22. The expected endpoints are:

- `GET /health`
- `POST /mcp`
- `GET /.well-known/oauth-protected-resource`
- `GET /.well-known/oauth-authorization-server`
- `POST /oauth/register`
- `GET|POST /oauth/authorize`
- `POST /oauth/token`
- `POST /oauth/revoke`

Verify `/health` returns `200`, anonymous `/mcp` initialization returns `401`, then connect one client and run `gsc_list_properties`. A `503` health response means required configuration is absent; it does not reveal secret values.

## Quotas relevant to operation

Google currently documents Search Analytics per-site and per-user limits of 1,200 queries/minute, plus project limits of 40,000 queries/minute and 30,000,000 queries/day. URL Inspection is much tighter: 600 queries/minute and 2,000/day per property. The gateway retries quota/transient failures at most twice with bounded backoff and returns a coarse error after that; callers should not spin or retry aggressively.
