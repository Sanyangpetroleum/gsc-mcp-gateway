import { federationConfigured } from "@/lib/gsc/wif";
import { redisConfigured } from "@/lib/oauth/redis-config";
const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export function publicBaseUrl(request?: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return trimTrailingSlash(configured);
  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    if (forwardedHost) return `${forwardedProto}://${forwardedHost.split(",")[0].trim()}`;
    return new URL(request.url).origin;
  }
  return "http://localhost:3000";
}

export function configurationStatus() {
  const googleConfigured =
    process.env.GSC_AUTH_MODE === "vercel_oidc"
      ? federationConfigured()
      : Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64);
  const signingConfigured = Boolean(process.env.MCP_TOKEN_SIGNING_SECRET);
  const adminConfigured = Boolean(process.env.MCP_ADMIN_PASSWORD);
  const durableRedisConfigured = redisConfigured();
  const localMemoryAllowed = process.env.ALLOW_IN_MEMORY_OAUTH === "true";
  const oauthStoreConfigured = durableRedisConfigured || localMemoryAllowed;
  return {
    ready: googleConfigured && signingConfigured && adminConfigured && oauthStoreConfigured,
    googleConfigured,
    signingConfigured,
    adminConfigured,
    oauthStoreConfigured,
    persistentOAuthStore: durableRedisConfigured,
  };
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Required server configuration is missing: ${name}`);
  return value;
}
