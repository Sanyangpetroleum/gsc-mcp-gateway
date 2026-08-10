import { beforeEach, describe, expect, it } from "vitest";
import { POST as registerClient } from "@/app/oauth/register/route";
import { POST as tokenEndpoint } from "@/app/oauth/token/route";
import { GET as protectedResource } from "@/app/.well-known/oauth-protected-resource/route";
import { POST as mcpPost } from "@/app/mcp/route";
import { MemoryOAuthStore, setOAuthStoreForTests } from "@/lib/oauth/store";
import { issueAccessToken, MCP_SCOPE, sha256 } from "@/lib/oauth/crypto";
import { validateAuthorizationQuery } from "@/lib/oauth/authorize";

const origin = "https://gsc.example.test";

beforeEach(() => {
  process.env.PUBLIC_BASE_URL = origin;
  process.env.MCP_TOKEN_SIGNING_SECRET = Buffer.alloc(32, 7).toString("base64url");
  process.env.MCP_ADMIN_PASSWORD = "test-password";
  process.env.ALLOW_IN_MEMORY_OAUTH = "true";
  setOAuthStoreForTests(new MemoryOAuthStore());
});

describe("OAuth and MCP boundary", () => {
  it("publishes protected-resource metadata", async () => {
    const response = await protectedResource(new Request(`${origin}/.well-known/oauth-protected-resource`));
    expect(await response.json()).toMatchObject({
      resource: `${origin}/mcp`,
      authorization_servers: [origin],
      scopes_supported: [MCP_SCOPE],
    });
  });

  it("registers HTTPS clients and rejects unsafe redirects", async () => {
    const good = await registerClient(new Request(`${origin}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        redirect_uris: ["https://chat.example/callback"],
        token_endpoint_auth_method: "none",
        client_name: "Test Client",
      }),
    }));
    expect(good.status).toBe(201);
    expect(await good.json()).toMatchObject({ token_endpoint_auth_method: "none" });

    const bad = await registerClient(new Request(`${origin}/oauth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["http://attacker.example/callback"] }),
    }));
    expect(bad.status).toBe(400);
  });

  it("rate limits repeated dynamic client registrations", async () => {
    let last: Response | undefined;
    for (let index = 0; index < 21; index += 1) {
      last = await registerClient(new Request(`${origin}/oauth/register`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.10",
        },
        body: JSON.stringify({
          redirect_uris: ["https://chat.example/callback"],
          token_endpoint_auth_method: "none",
        }),
      }));
    }
    expect(last?.status).toBe(429);
  });

  it("uses authorization codes once and validates PKCE", async () => {
    const store = new MemoryOAuthStore();
    setOAuthStoreForTests(store);
    await store.putClient({
      clientId: "client",
      redirectUris: ["https://chat.example/callback"],
      tokenEndpointAuthMethod: "none",
      createdAt: 1,
    }, 1000);
    const verifier = "a".repeat(43);
    const code = "one-time-code";
    await store.putAuthorizationCode(sha256(code), {
      clientId: "client",
      redirectUri: "https://chat.example/callback",
      codeChallenge: sha256(verifier),
      scopes: [MCP_SCOPE, "offline_access"],
      subject: "owner",
      resource: `${origin}/mcp`,
    }, 120);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "client",
      code,
      code_verifier: verifier,
      redirect_uri: "https://chat.example/callback",
      resource: `${origin}/mcp`,
    });
    const first = await tokenEndpoint(new Request(`${origin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ token_type: "Bearer", expires_in: 3600 });

    const replay = await tokenEndpoint(new Request(`${origin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }));
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("requires resource audience binding at the token endpoint", async () => {
    const store = new MemoryOAuthStore();
    setOAuthStoreForTests(store);
    await store.putClient({
      clientId: "client",
      redirectUris: ["https://chat.example/callback"],
      tokenEndpointAuthMethod: "none",
      createdAt: 1,
    }, 1000);
    const response = await tokenEndpoint(new Request(`${origin}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "client",
        code: "unused",
        code_verifier: "a".repeat(43),
        redirect_uri: "https://chat.example/callback",
      }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "invalid_target" });
  });

  it("requires resource audience binding at authorization", async () => {
    const store = new MemoryOAuthStore();
    setOAuthStoreForTests(store);
    await store.putClient({
      clientId: "client",
      redirectUris: ["https://chat.example/callback"],
      tokenEndpointAuthMethod: "none",
      createdAt: 1,
    });
    const query = new URLSearchParams({
      response_type: "code",
      client_id: "client",
      redirect_uri: "https://chat.example/callback",
      state: "state",
      code_challenge: "a".repeat(43),
      code_challenge_method: "S256",
      scope: MCP_SCOPE,
    });
    await expect(validateAuthorizationQuery(
      query,
      new Request(`${origin}/oauth/authorize?${query}`),
    )).rejects.toThrow("resource");
    query.set("resource", `${origin}/mcp`);
    await expect(validateAuthorizationQuery(
      query,
      new Request(`${origin}/oauth/authorize?${query}`),
    )).resolves.toMatchObject({ resource: `${origin}/mcp` });
  });

  it("rejects anonymous MCP requests", async () => {
    const response = await mcpPost(new Request(`${origin}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      }),
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource");
  });

  it("initializes MCP with a valid gateway token and rejects malformed calls", async () => {
    const token = await issueAccessToken({ clientId: "client", subject: "owner", scopes: [MCP_SCOPE] });
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    };
    const initialized = await mcpPost(new Request(`${origin}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      }),
    }));
    expect(initialized.status).toBe(200);
    expect(await initialized.text()).toContain("gsc-mcp-gateway");

    const malformed = await mcpPost(new Request(`${origin}/mcp`, {
      method: "POST",
      headers,
      body: "{bad json",
    }));
    expect(malformed.status).toBeGreaterThanOrEqual(400);
  });
});
