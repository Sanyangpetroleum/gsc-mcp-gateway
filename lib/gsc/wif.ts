import { ExternalAccountClient } from "google-auth-library";
import { headers } from "next/headers";
import { GSC_SCOPE } from "./types";

export interface GscFederationConfig {
  projectNumber: string;
  poolId: string;
  providerId: string;
  serviceAccountEmail: string;
}

const numericProject = /^\d{6,20}$/;
const identifier = /^[a-z][a-z0-9-]{2,62}$/;
const serviceAccount = /^[a-z0-9._-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;

export function federationConfig(
  env: Record<string, string | undefined> = process.env,
): GscFederationConfig {
  const projectNumber = env.GCP_PROJECT_NUMBER?.trim() ?? "";
  const poolId = env.GCP_WORKLOAD_IDENTITY_POOL_ID?.trim() ?? "";
  const providerId = env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID?.trim() ?? "";
  const serviceAccountEmail = env.GCP_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  if (
    !numericProject.test(projectNumber) || !identifier.test(poolId) ||
    !identifier.test(providerId) || !serviceAccount.test(serviceAccountEmail)
  ) {
    throw new Error("Required server configuration is invalid: GSC workload federation");
  }
  return { projectNumber, poolId, providerId, serviceAccountEmail };
}

export function federationConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.GSC_AUTH_MODE !== "vercel_oidc") return false;
  try { federationConfig(env); return true; }
  catch { return false; }
}

async function getVercelSubjectToken() {
  const token = (await headers()).get("x-vercel-oidc-token");
  if (!token) throw new Error("Vercel OIDC token unavailable");
  return token;
}

/**
 * A scoped Google access token for a single, explicitly named service account.
 * The reader and optional sitemap writer must use different accounts and scopes.
 * No persistent JSON key or access token is returned to MCP clients.
 */
export function federatedScopedGscTokenProvider(
  scope: typeof GSC_SCOPE | "https://www.googleapis.com/auth/webmasters",
  serviceAccountEmail: string,
  supplier: () => Promise<string> = getVercelSubjectToken,
  env: Record<string, string | undefined> = process.env,
) {
  if (env.GSC_AUTH_MODE !== "vercel_oidc") {
    throw new Error("Required server configuration is invalid: GSC_AUTH_MODE");
  }
  const settings = federationConfig(env);
  if (!serviceAccount.test(serviceAccountEmail)) {
    throw new Error("Required server configuration is invalid: Sitemap Google identity");
  }
  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${settings.projectNumber}/locations/global/workloadIdentityPools/${settings.poolId}/providers/${settings.providerId}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url:
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${serviceAccountEmail}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: supplier },
  });
  if (!authClient) throw new Error("Required server configuration is invalid: federation client");
  authClient.scopes = [scope];
  return async () => {
    const token = (await authClient.getAccessToken()).token;
    if (!token) throw new Error("Google Search Console authentication failed");
    return token;
  };
}

export function federatedGscTokenProvider(
  supplier: () => Promise<string> = getVercelSubjectToken,
  env: Record<string, string | undefined> = process.env,
) {
  const readAccount = federationConfig(env).serviceAccountEmail;
  return federatedScopedGscTokenProvider(GSC_SCOPE, readAccount, supplier, env);
}
