# Deployment setup

These are the only administrator steps needed after the code is deployed.

## 1. Google identity (Vercel Workload Identity Federation preferred)

**Production recommendation: keyless OIDC federation. Never disable an organization policy that blocks creation of service-account keys.** Google Search Console API must be enabled in the intended GCP project.

For the existing `SanyangOS` / Vercel `gsc-mcp-gateway` deployment:
1. Keep the dedicated `gsc-mcp-reader` Google service account, without any Google Cloud project-wide roles.
2. In each Search Console property, add `gsc-mcp-reader@sanyangos.iam.gserviceaccount.com` as a **Full user**. This is separate from GCP IAM.
3. Create Google Workload Identity Pool `vercel-gsc` with an OIDC provider. Confirm the actual provider ID from Google Cloud (do not confuse it with the display name). Configure issuer `https://oidc.vercel.com/sanyangpetroleum` and allowed audience `https://vercel.com/sanyangpetroleum`.
4. Map `google.subject = assertion.sub`. Set a restrictive provider attribute condition to allow only the production MCP project based on **actual verified Vercel claim names**; the condition should be checked against a live token, not guessed from a screenshot. Exact subject: `owner:sanyangpetroleum:project:gsc-mcp-gateway:environment:production`.
5. Grant that **exact subject** the `roles/iam.workloadIdentityUser` permission on the specific `gsc-mcp-reader` service account using Google Cloud's workload-identity Grant access screen. Avoid granting the whole pool access.
6. Enable the **IAM Service Account Credentials API** (iamcredentials.googleapis.com) needed for impersonation, without introducing a service-account JSON private key.
7. Confirm Vercel Project → Settings → Security → OIDC issuer mode is Team and its displayed issuer, audience and subject match the above.
8. Configure only these non-secret Vercel production environment variables:

| Variable | Value |
|---|---|
| `GSC_AUTH_MODE` | `vercel_oidc` |
| `GCP_PROJECT_NUMBER` | Numeric Google Cloud project number (from IAM & Admin → Settings; NOT the project ID) |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | `vercel-gsc` |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | Actual provider ID confirmed in Google Cloud |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `gsc-mcp-reader@sanyangos.iam.gserviceaccount.com` |

The MCP reads the short-lived `x-vercel-oidc-token` from the Vercel function request context and exchanges it through Google's official STS + Service Account Credentials APIs. Do **not** create a Google JSON key or upload the workload credential configuration file.

**Legacy fallback:** `GSC_AUTH_MODE=service_account_json` (or omitted) continues to support existing deployments with an already-approved JSON service account credential. It is NOT a reason to weaken `iam.disableServiceAccountKeyCreation`.

References: https://vercel.com/docs/oidc/gcp and https://cloud.google.com/iam/docs/workload-identity-federation-with-other-providers .

## 2. Gateway OAuth state and secrets

Provision one Upstash Redis database in the same Vercel account/region. Store these server-only environment variables:

| Variable | Purpose |
|---|---|
| `PUBLIC_BASE_URL` | Exact HTTPS origin, with no trailing slash |
| `MCP_TOKEN_SIGNING_SECRET` | At least 32 random bytes, base64url-encoded |
| `MCP_ADMIN_PASSWORD` | Strong unique operator authorization password |
| `UPSTASH_REDIS_REST_URL` | Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST secret |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Complete service-account JSON, stored encrypted |
| `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` | Optional base64 alternative; do not set both |

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

## Optional Sitemap write activation (not required for SEO analytics)

This requires **separate owner approval** after the read-only gateway is healthy; do not re-use or upgrade its read credentials. Provision a second Google Cloud service account with Search Console API access, explicitly grant it the intended Search Console property's Full user permission (not owner), and store its JSON in the encrypted server variable `GSC_SITEMAP_WRITE_SERVICE_ACCOUNT_JSON`.

Set `GSC_SITEMAP_WRITE_PROPERTIES` to the exact approved GSC property IDs, `MCP_WRITE_ADMIN_PASSWORD` to a strong password different from `MCP_ADMIN_PASSWORD`, and `GSC_SITEMAP_WRITE_ENABLED=true` only after separate approval. The service will register the new `gsc_submit_sitemap` tool on restart. Existing `gsc.read` clients remain read-only; a write-capable client must reconnect and request `gsc.read gsc.sitemaps.write`, authorize with the **separate** write password, and explicitly invoke a confirmed XML Sitemap submission. Do not paste credentials into chats.

A submitted Sitemap is a crawl discovery hint, not guaranteed indexing or a way to submit arbitrary article URLs. Do not enable or deploy on a code-only request without the separate production/configuration gate.
