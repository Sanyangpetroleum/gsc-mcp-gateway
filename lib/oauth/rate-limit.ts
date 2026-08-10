import { sha256 } from "./crypto";
import { oauthStore } from "./store";

function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  return sha256(address);
}

export async function allowOAuthRequest(
  request: Request,
  endpoint: string,
  limit: number,
  windowSeconds: number,
) {
  return oauthStore().allowRequest(
    `${endpoint}:${requestFingerprint(request)}`,
    limit,
    windowSeconds,
  );
}
