import { describe, expect, it } from "vitest";
import { approvedSitemapDeployment, assertAuthorizedSitemapRun } from "@/lib/gsc/deployment-sync";

const repo = "Sanyangpetroleum/sanyangpetroleum";
const workflowRef = repo + "/.github/workflows/cloudflare-production.yml@refs/heads/main";
const env = {
  PUBLIC_BASE_URL: "https://gsc-mcp-gateway.vercel.app",
  GSC_AUTH_MODE: "vercel_oidc",
  GCP_PROJECT_NUMBER: "123456789012",
  GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel-gsc",
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel-gsc-production",
  GCP_SERVICE_ACCOUNT_EMAIL: "gsc-reader@google-project.iam.gserviceaccount.com",
  GSC_SITEMAP_WRITE_AUTH_MODE: "vercel_oidc",
  GCP_SITEMAP_WRITE_SERVICE_ACCOUNT_EMAIL: "gsc-writer@google-project.iam.gserviceaccount.com",
  GSC_SITEMAP_WRITE_ENABLED: "true",
  GSC_SITEMAP_WRITE_PROPERTIES: "sc-domain:sanyangpetroleum.com",
  MCP_ADMIN_PASSWORD: "read-only-password",
  MCP_WRITE_ADMIN_PASSWORD: "distinct-write-password",
  GSC_SITEMAP_AUTO_SUBMIT_ENABLED: "true",
  GSC_AUTOSYNC_GITHUB_REPOSITORY: repo,
  GSC_AUTOSYNC_GITHUB_REPOSITORY_ID: "1325430708",
  GSC_AUTOSYNC_GITHUB_WORKFLOW_REF: workflowRef,
  GSC_AUTOSYNC_PROPERTY: "sc-domain:sanyangpetroleum.com",
  GSC_AUTOSYNC_SITEMAP_URL: "https://sanyangpetroleum.com/sitemap.xml",
};

describe("opt-in exact GitHub deployment Sitemap automation", () => {
  it("is disabled until all independent writer + deployment gates are present", () => {
    expect(approvedSitemapDeployment({})).toBeNull();
    expect(approvedSitemapDeployment({ ...env, GSC_SITEMAP_AUTO_SUBMIT_ENABLED: "false" })).toBeNull();
    expect(approvedSitemapDeployment({ ...env, GSC_SITEMAP_WRITE_ENABLED: "false" })).toBeNull();
    expect(approvedSitemapDeployment({ ...env, GCP_SITEMAP_WRITE_SERVICE_ACCOUNT_EMAIL: env.GCP_SERVICE_ACCOUNT_EMAIL })).toBeNull();
    expect(approvedSitemapDeployment({ ...env, GSC_AUTOSYNC_PROPERTY: "sc-domain:other.example" })).toBeNull();
    expect(approvedSitemapDeployment({ ...env, GSC_AUTOSYNC_SITEMAP_URL: "https://attacker.example/sitemap.xml" })).toBeNull();
    expect(approvedSitemapDeployment({ ...env, GSC_AUTOSYNC_GITHUB_WORKFLOW_REF: repo + "/.github/workflows/other.yml@refs/heads/main" })).toBeNull();
  });

  it("locks the approval to one HTTPS endpoint, Sitemap and Google property", () => {
    expect(approvedSitemapDeployment(env)).toEqual({
      audience: "https://gsc-mcp-gateway.vercel.app/api/sitemap-sync",
      repository: repo, repositoryId: "1325430708", workflowRef,
      property: "sc-domain:sanyangpetroleum.com",
      sitemapUrl: "https://sanyangpetroleum.com/sitemap.xml",
    });
  });

  it("requires the signed GitHub token to represent only the intended main-branch push workflow", () => {
    const approval = approvedSitemapDeployment(env);
    if (!approval) throw new Error("expected valid test approval");
    const claims = {
      repository: repo,
      repository_id: "1325430708",
      ref: "refs/heads/main",
      workflow_ref: workflowRef,
      event_name: "push",
    };
    expect(assertAuthorizedSitemapRun(claims, approval)).toBe(true);
    for (const changed of [
      { repository: "attacker/clone" },
      { repository_id: "555" },
      { ref: "refs/heads/feature" },
      { workflow_ref: repo + "/.github/workflows/unapproved.yml@refs/heads/main" },
      { event_name: "pull_request" },
    ]) {
      expect(() => assertAuthorizedSitemapRun({ ...claims, ...changed }, approval)).toThrow("not authorized");
    }
  });
});
