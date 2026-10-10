import { describe, expect, it, vi } from "vitest";
import type { Redis } from "@upstash/redis";
import { RedisOAuthStore } from "@/lib/oauth/store";

const authorizationCode = {
  clientId: "registered-oauth-client",
  redirectUri: "https://chatgpt.com/oauth/callback",
  codeChallenge: "signed-pkce-challenge",
  scopes: ["gsc.read"],
  subject: "gsc-gateway-owner",
  resource: "https://gsc-mcp-gateway.vercel.app/mcp",
};

function storeWithEvalResponse(response: unknown) {
  const evalMock = vi.fn().mockResolvedValue(response);
  const redis = { eval: evalMock } as unknown as Redis;
  return { store: new RedisOAuthStore(redis), evalMock };
}

describe("OAuth Redis consume compatibility", () => {
  it("returns an authorization record when Upstash EVAL auto-deserializes JSON", async () => {
    const { store, evalMock } = storeWithEvalResponse(authorizationCode);
    expect(await store.consumeAuthorizationCode("hashed-code")).toEqual(authorizationCode);
    expect(evalMock).toHaveBeenCalledTimes(1);
    const [, keys, args] = evalMock.mock.calls[0];
    expect(keys).toEqual(["gsc-mcp:code:hashed-code"]);
    expect(args).toEqual([]);
  });

  it("still accepts raw JSON strings from Redis scripting", async () => {
    const { store } = storeWithEvalResponse(JSON.stringify(authorizationCode));
    expect(await store.consumeAuthorizationCode("hashed-code")).toEqual(authorizationCode);
  });

  it("works equally for single-use refresh tokens", async () => {
    const record = {
      clientId: "registered-oauth-client",
      subject: "gsc-gateway-owner",
      scopes: ["gsc.read", "offline_access"],
      resource: "https://gsc-mcp-gateway.vercel.app/mcp",
    };
    const { store, evalMock } = storeWithEvalResponse(record);
    expect(await store.consumeRefreshToken("hash")).toEqual(record);
    expect(evalMock.mock.calls[0][1]).toEqual(["gsc-mcp:refresh:hash"]);
  });

  it("fails closed on missing, unparseable, or unexpected Redis responses", async () => {
    for (const response of [null, undefined, "not json", "42", 42, ["unexpected"]]) {
      const { store } = storeWithEvalResponse(response);
      expect(await store.consumeAuthorizationCode("hash")).toBeNull();
    }
  });
});
