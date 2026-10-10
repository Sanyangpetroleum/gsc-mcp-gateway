/**
 * Resolve OAuth's durable Upstash REST store from either the manual Upstash
 * convention or Vercel Marketplace's auto-injected KV names.
 * Never mix URLs/tokens from different credential sets.
 */
export function redisCredentials(
  env: Record<string, string | undefined> = process.env,
): { url: string; token: string } | null {
  const pairs = [
    ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
    ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
  ] as const;
  for (const [urlKey, tokenKey] of pairs) {
    const url = env[urlKey]?.trim();
    const token = env[tokenKey]?.trim();
    if (!url && !token) continue;
    if (!url || !token) {
      throw new Error("Required server configuration is invalid: incomplete OAuth Redis credentials");
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Required server configuration is invalid: OAuth Redis REST URL");
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        parsed.search || parsed.hash || parsed.pathname !== "/") {
      throw new Error("Required server configuration is invalid: OAuth Redis REST URL");
    }
    return { url, token };
  }
  return null;
}

export function redisConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  try { return redisCredentials(env) !== null; }
  catch { return false; }
}
