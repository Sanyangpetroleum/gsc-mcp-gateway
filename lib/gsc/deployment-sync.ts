import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { publicBaseUrl } from "@/lib/config";
import { allowedSitemapProperties, sitemapWriteConfigured, validateSitemapSubmission } from "@/lib/gsc/sitemap-write";

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_JWKS = createRemoteJWKSet(new URL(GITHUB_ISSUER + "/.well-known/jwks"));

export interface ApprovedSitemapDeployment {
  audience: string;
  repository: string;
  repositoryId: string;
  workflowRef: string;
  property: string;
  sitemapUrl: string;
}

/**
 * Default OFF. This is an independently authorized machine-to-machine ingress:
 * the only possible mutation is an exact allowlisted Google Sitemap submission.
 * Neither the GitHub caller nor a ChatGPT client ever sees Google credentials.
 */
export function approvedSitemapDeployment(
  env: Record<string, string | undefined> = process.env,
): ApprovedSitemapDeployment | null {
  if (env.GSC_SITEMAP_AUTO_SUBMIT_ENABLED !== "true" || !sitemapWriteConfigured(env)) return null;
  const origin = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") ?? "";
  const repository = env.GSC_AUTOSYNC_GITHUB_REPOSITORY?.trim() ?? "";
  const repositoryId = env.GSC_AUTOSYNC_GITHUB_REPOSITORY_ID?.trim() ?? "";
  const workflowRef = env.GSC_AUTOSYNC_GITHUB_WORKFLOW_REF?.trim() ?? "";
  const property = env.GSC_AUTOSYNC_PROPERTY?.trim() ?? "";
  const sitemapUrl = env.GSC_AUTOSYNC_SITEMAP_URL?.trim() ?? "";
  if (
    !origin.startsWith("https://") ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
    !/^\d+$/.test(repositoryId) ||
    workflowRef !== repository + "/.github/workflows/cloudflare-production.yml@refs/heads/main" ||
    !property || !sitemapUrl
  ) return null;
  try {
    if (!allowedSitemapProperties(env).has(property)) return null;
    validateSitemapSubmission(property, sitemapUrl, allowedSitemapProperties(env));
  } catch {
    return null;
  }
  return {
    audience: publicBaseUrl() + "/api/sitemap-sync",
    repository, repositoryId, workflowRef, property, sitemapUrl,
  };
}

export function assertAuthorizedSitemapRun(
  claims: JWTPayload,
  approved: ApprovedSitemapDeployment,
) {
  if (
    claims.repository !== approved.repository ||
    String(claims.repository_id ?? "") !== approved.repositoryId ||
    claims.ref !== "refs/heads/main" ||
    claims.workflow_ref !== approved.workflowRef ||
    claims.event_name !== "push"
  ) throw new Error("GitHub deployment is not authorized to submit this Sitemap");
  return true;
}

export async function verifyAuthorizedGithubDeployment(
  jwt: string,
  approved: ApprovedSitemapDeployment,
) {
  const verified = await jwtVerify(jwt, GITHUB_JWKS, {
    issuer: GITHUB_ISSUER,
    audience: approved.audience,
    algorithms: ["RS256"],
    clockTolerance: "15s",
  });
  assertAuthorizedSitemapRun(verified.payload, approved);
}
