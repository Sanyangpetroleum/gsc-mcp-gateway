import { afterEach, describe, expect, it } from "vitest";
import { createGscClientFromEnv, resetSharedGscClientForTests } from "@/lib/gsc/client";
import { configurationStatus } from "@/lib/config";
import { federationConfig, federationConfigured, federatedGscTokenProvider } from "@/lib/gsc/wif";

const settings: Record<string, string> = {
  GSC_AUTH_MODE: "vercel_oidc",
  GCP_PROJECT_NUMBER: "123456789012",
  GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel-gsc",
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel-gsc-production",
  GCP_SERVICE_ACCOUNT_EMAIL: "gsc-mcp-reader@example-project.iam.gserviceaccount.com",
};

afterEach(() => {
  for (const key of Object.keys(settings)) delete process.env[key];
  resetSharedGscClientForTests();
});

describe("keyless GSC workload federation", () => {
  it("accepts a bounded project / provider / service account config", () => {
    expect(federationConfigured(settings)).toBe(true);
    expect(federationConfig(settings)).toEqual({
      projectNumber: "123456789012",
      poolId: "vercel-gsc",
      providerId: "vercel-gsc-production",
      serviceAccountEmail: settings.GCP_SERVICE_ACCOUNT_EMAIL,
    });
  });
  it("rejects missing or malformed provider identity and disables without opt-in", () => {
    expect(federationConfigured({})).toBe(false);
    expect(federationConfigured({ ...settings, GSC_AUTH_MODE: "service_account_json" })).toBe(false);
    expect(federationConfigured({ ...settings, GCP_PROJECT_NUMBER: "sanyangos" })).toBe(false);
    expect(federationConfigured({ ...settings, GCP_SERVICE_ACCOUNT_EMAIL: "bad@example.org" })).toBe(false);
    expect(federationConfigured({ ...settings, GCP_WORKLOAD_IDENTITY_POOL_ID: "../untrusted" })).toBe(false);
    expect(() => federationConfig({ ...settings, GCP_PROJECT_NUMBER: "../other" })).toThrow("configuration");
  });
  it("supports ADC external-account config without requiring a private key", () => {
    expect(typeof federatedGscTokenProvider(async () => "mock-oidc", settings)).toBe("function");
    expect(() => federatedGscTokenProvider(async () => "token", {})).toThrow("configuration");
  });
  it("switches the shared GSC client to keyless auth and checks health independently", () => {
    Object.assign(process.env, settings);
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
    const client = createGscClientFromEnv();
    expect(client).toBeDefined();
    expect(configurationStatus().googleConfigured).toBe(true);
    expect(configurationStatus().ready).toBe(false);
  });
});
