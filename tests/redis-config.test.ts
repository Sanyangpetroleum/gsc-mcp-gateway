import { describe, expect, it } from "vitest";
import { redisCredentials, redisConfigured } from "@/lib/oauth/redis-config";
import { configurationStatus } from "@/lib/config";

const kv = { KV_REST_API_URL: "https://regional.upstash.io", KV_REST_API_TOKEN: "test-redacted" };
const named = {
  UPSTASH_REDIS_REST_URL: "https://redis.example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-primary",
};
describe("Vercel Upstash OAuth storage compatibility", () => {
  it("uses automatically injected KV REST environment variable pair", () => {
    expect(redisCredentials(kv)).toEqual({ url: kv.KV_REST_API_URL, token: kv.KV_REST_API_TOKEN });
    expect(redisConfigured(kv)).toBe(true);
  });
  it("accepts the existing manual Upstash pair without regression", () => {
    expect(redisCredentials(named)).toEqual({
      url: named.UPSTASH_REDIS_REST_URL, token: named.UPSTASH_REDIS_REST_TOKEN,
    });
  });
  it("never mixes a URL from one pair with another pair's token", () => {
    expect(redisConfigured({ KV_REST_API_URL: kv.KV_REST_API_URL, UPSTASH_REDIS_REST_TOKEN: named.UPSTASH_REDIS_REST_TOKEN })).toBe(false);
    expect(() => redisCredentials({ KV_REST_API_URL: kv.KV_REST_API_URL, UPSTASH_REDIS_REST_TOKEN: named.UPSTASH_REDIS_REST_TOKEN })).toThrow("incomplete");
    expect(redisConfigured({ ...kv, UPSTASH_REDIS_REST_URL: named.UPSTASH_REDIS_REST_URL })).toBe(false);
  });
  it("rejects non-HTTPS REST endpoints or embedded credentials", () => {
    expect(redisConfigured({ ...kv, KV_REST_API_URL: "http://localhost:6379" })).toBe(false);
    expect(redisConfigured({ ...kv, KV_REST_API_URL: "https://user:pass@regional.upstash.io" })).toBe(false);
  });
  it("uses REST URL plus token without exposing secrets in health output", () => {
    const previous = {
      KV_REST_API_URL: process.env.KV_REST_API_URL,
      KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    };
    try {
      process.env.KV_REST_API_URL = kv.KV_REST_API_URL;
      process.env.KV_REST_API_TOKEN = kv.KV_REST_API_TOKEN;
      const status = configurationStatus();
      expect(status.persistentOAuthStore).toBe(true);
      expect(status.oauthStoreConfigured).toBe(true);
      expect(JSON.stringify(status)).not.toContain(kv.KV_REST_API_TOKEN);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
