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

**Vercel Marketplace Upstash compatibility:** The Free Upstash for Redis integration can inject `KV_REST_API_URL` and `KV_REST_API_TOKEN` instead of the original `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` keys. The gateway accepts either complete REST credential pair, with the manually named Upstash pair taking priority when present. Do not reveal or copy Redis tokens into chat or duplicate secrets manually; use the existing encrypted Marketplace connection.

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

**Not yet activated. Requires explicit owner approval for IAM, GSC permissions, production configuration and deployment.** The live gateway already uses `GSC_AUTH_MODE=vercel_oidc`; do not reintroduce a long-lived Google private key or widen the existing reader account's scope.

1. Authorize a **second Google service account** (e.g. `gsc-mcp-writer@sanyangos.iam.gserviceaccount.com`) for sitemap writes. Grant it **Full user** in the exact Search Console properties, initially only `sc-domain:sanyangpetroleum.com`. Do not grant Search Console Owner or unrelated GCP roles.
2. Bind **only the verified Vercel production OIDC subject** of `gsc-mcp-gateway` to this second service account with `roles/iam.workloadIdentityUser`. Use the already trusted WIF pool/provider, but an account-specific binding; do not grant all pool members. The reader remains unchanged.
3. After verifying the separate identity and approval, configure the following **server-only Vercel production variables** (the write password is secret):

| Key | Authorized value |
|---|---|
| `GSC_SITEMAP_WRITE_AUTH_MODE` | `vercel_oidc` |
| `GCP_SITEMAP_WRITE_SERVICE_ACCOUNT_EMAIL` | Exact separately approved writer service-account email |
| `GSC_SITEMAP_WRITE_PROPERTIES` | Exact property IDs; first `sc-domain:sanyangpetroleum.com` |
| `MCP_WRITE_ADMIN_PASSWORD` | New, distinct password entered only through secure authorization UI |
| `GSC_SITEMAP_WRITE_ENABLED` | `true` **only when every preceding gate is approved and verified** |

4. Redeploy only after production permission and deployment approval. Verify read-only tools still work. A write-capable MCP client must reconnect and explicitly request `gsc.read gsc.sitemaps.write`, pass the separate write password and send a specific `gsc_submit_sitemap` invocation with `confirm="SUBMIT_SITEMAP"`.
5. Use `gsc_sitemap_readiness` to check whether a sitemap was already registered. Existing registered sitemaps can be kept up to date by publishing their updated XML; re-submit when a new sitemap is added or when an explicit refresh is warranted. Use `gsc_url_hygiene_check` to catch invisible pasted URL characters.

**Legacy only:** `GSC_SITEMAP_WRITE_AUTH_MODE=service_account_json` and `GSC_SITEMAP_WRITE_SERVICE_ACCOUNT_JSON` remain supported for already authorized legacy configurations. Do not create a new JSON key if WIF is available or an organization policy prohibits key creation.

Sitemap submission uses only Google's `sitemaps.submit` API. It cannot invoke the Search Console UI's Request Indexing function for ordinary articles. Source changes, test results, and registered-sitemap metadata alone do not constitute an active automated production submission.

## Opt-in automatic Sitemap notification after successful Cloudflare deployment

This is source-level work in the **existing gateway** and **existing Sanyang Cloudflare GitHub Actions release**, not another SEO service. The automation remains OFF until the Founder separately approves Google permissions, production deployment and configuration. It never automates ordinary-article `Request Indexing`.

1. Complete the **distinct, keyless Sitemap writer** setup above. Verify a successful manual `gsc_submit_sitemap` with the approved GSC property before enabling automation.
2. Set these Vercel production variables only after approval: `GSC_SITEMAP_AUTO_SUBMIT_ENABLED=true`, `GSC_AUTOSYNC_GITHUB_REPOSITORY=Sanyangpetroleum/sanyangpetroleum`, `GSC_AUTOSYNC_GITHUB_REPOSITORY_ID=1325430708`, `GSC_AUTOSYNC_GITHUB_WORKFLOW_REF=Sanyangpetroleum/sanyangpetroleum/.github/workflows/cloudflare-production.yml@refs/heads/main`, `GSC_AUTOSYNC_PROPERTY=sc-domain:sanyangpetroleum.com`, `GSC_AUTOSYNC_SITEMAP_URL=https://sanyangpetroleum.com/sitemap.xml`.
3. On the **website repository**, set GitHub Actions **variable** `GSC_SITEMAP_AUTO_SUBMIT_ENABLED=true` only after reviewing PR #42 and the GSC gateway deployment. This variable carries **no secret**. The `gsc_sitemap_notify` job receives a short-lived signed GitHub Actions OIDC token **only after** the canonical Cloudflare `deploy` job succeeds and the main-branch push changed `public/sitemap.xml` or `scripts/generate-sitemap.ts`. It sends the token only to `https://gsc-mcp-gateway.vercel.app/api/sitemap-sync`.
4. The gateway verifies issuer `https://token.actions.githubusercontent.com`, audience `https://gsc-mcp-gateway.vercel.app/api/sitemap-sync`, signature, repository, immutable repository ID, push event, `refs/heads/main`, and the exact workflow file. It then checks existing Google read access, exact Sitemap writer property allowlist, and sends one Google `sitemaps.submit` PUT using its separate Google writer identity. The website never receives Google credentials.
5. Verify one real post-release receipt: deployment job `success`; Github `GSC_SITEMAP_SUBMITTED=ACCEPTED`; Google HTTP 2xx; `gsc_sitemap_readiness` reports updated registration. GSC `lastDownloaded` can lag and indexing is never immediate or guaranteed.

**Disable/recover:** switch either `GSC_SITEMAP_AUTO_SUBMIT_ENABLED` flag to `false` (gateway and GitHub have independent gates). Turning off `GSC_SITEMAP_WRITE_ENABLED` disables both the MCP write tool and machine endpoint. No key rotation or permission broadening is necessary to turn the capability OFF.

**Security review required:** keep the job's `id-token: write` permission scoped only to the opt-in notification job; do not enable it for the broader deployment workflow. The gateway must not accept arbitrary URLs, unauthenticated calls, a PR/preview workflow, other repositories or even a different production workflow.
