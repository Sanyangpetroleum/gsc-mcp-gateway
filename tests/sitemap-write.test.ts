import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GscSitemapWriter, MCP_SITEMAP_WRITE_SCOPE,
  allowedSitemapProperties, sitemapWriteConfigured, validateSitemapSubmission,
} from "@/lib/gsc/sitemap-write";
import { approveAuthorization, createAuthorizationFormToken, validateAuthorizationQuery } from "@/lib/oauth/authorize";
import { MCP_SCOPE, sha256 } from "@/lib/oauth/crypto";
import { MemoryOAuthStore, setOAuthStoreForTests } from "@/lib/oauth/store";

const property = "sc-domain:example.com";
const sitemap = "https://example.com/sitemap.xml";
const env = {
  GSC_SITEMAP_WRITE_ENABLED: "true",
  GSC_SITEMAP_WRITE_PROPERTIES: property,
  GSC_SITEMAP_WRITE_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}',
  MCP_WRITE_ADMIN_PASSWORD: "distinct-write-password",
  MCP_ADMIN_PASSWORD: "read-password",
};

afterEach(() => {
  delete process.env.GSC_SITEMAP_WRITE_ENABLED;
  delete process.env.GSC_SITEMAP_WRITE_PROPERTIES;
  delete process.env.GSC_SITEMAP_WRITE_SERVICE_ACCOUNT_JSON;
  delete process.env.MCP_WRITE_ADMIN_PASSWORD;
});

describe("separate Sitemap write capability", () => {
  it("defaults disabled and requires separate credentials, scope and owner password", () => {
    expect(sitemapWriteConfigured({})).toBe(false);
    expect(sitemapWriteConfigured({ ...env, MCP_WRITE_ADMIN_PASSWORD: "read-password" })).toBe(false);
    expect(sitemapWriteConfigured(env)).toBe(true);
  });

  it("refuses any other property and arbitrary URLs", () => {
    const allowed = allowedSitemapProperties(env);
    expect(validateSitemapSubmission(property, sitemap, allowed)).toBe(sitemap);
    for (const bad of [
      "https://attacker.example/sitemap.xml",
      "https://example.com/index.html",
      "http://example.com/sitemap.xml",
      "https://example.com/sitemap.xml?danger=1",
      "https://example.com/sitemap.xml#fragment",
      "https://example.com/redirect/sitemap.json",
    ]) {
      expect(() => validateSitemapSubmission(property, bad, allowed)).toThrow();
    }
    expect(() => validateSitemapSubmission("sc-domain:other.example", sitemap, allowed)).toThrow();
  });

  it("uses only the official Google PUT Sitemap endpoint without posting any page", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const writer = new GscSitemapWriter(async () => "mock-token", fetcher as typeof fetch);
    const result = await writer.submit(property, sitemap);
    expect(result.submitted).toBe(true);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toContain("sites/sc-domain%3Aexample.com/sitemaps/https%3A%2F%2Fexample.com%2Fsitemap.xml");
    expect(request.method).toBe("PUT");
    expect(request.body).toBeUndefined();
    expect(request.headers.Authorization).toBe("Bearer mock-token");
  });

  it("requires an explicit write scope and distinct write password during authorization", async () => {
    process.env.PUBLIC_BASE_URL = "https://mcp.example.com";
    process.env.MCP_TOKEN_SIGNING_SECRET = Buffer.alloc(32, 4).toString("base64url");
    Object.assign(process.env, env);
    const store = new MemoryOAuthStore();
    setOAuthStoreForTests(store);
    await store.putClient({
      clientId: "client", redirectUris: ["https://client.example/callback"],
      tokenEndpointAuthMethod: "none", createdAt: 1,
    });
    const query = new URLSearchParams({
      response_type: "code", client_id: "client",
      redirect_uri: "https://client.example/callback",
      state: "abc", code_challenge: sha256("v".repeat(43)),
      code_challenge_method: "S256",
      scope: `${MCP_SCOPE} ${MCP_SITEMAP_WRITE_SCOPE}`,
      resource: "https://mcp.example.com/mcp",
    });
    const request = new Request(`https://mcp.example.com/oauth/authorize?${query}`);
    const validated = await validateAuthorizationQuery(query, request);
    const token = await createAuthorizationFormToken(validated, request);
    await expect(approveAuthorization(token, env.MCP_ADMIN_PASSWORD, request)).rejects.toThrow("Access denied");
    const url = await approveAuthorization(token, env.MCP_WRITE_ADMIN_PASSWORD, request);
    expect(url).toContain("code=");
    delete process.env.GSC_SITEMAP_WRITE_ENABLED;
    await expect(validateAuthorizationQuery(query, request)).rejects.toThrow("scope");
    await expect(approveAuthorization(token, env.MCP_WRITE_ADMIN_PASSWORD, request)).rejects.toThrow("disabled");
  });
});
