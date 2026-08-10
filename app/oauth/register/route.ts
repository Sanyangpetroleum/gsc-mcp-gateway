import { jsonResponse, oauthError } from "@/lib/http";
import { parseRegistration } from "@/lib/oauth/client";
import { randomToken, sha256 } from "@/lib/oauth/crypto";
import { oauthStore } from "@/lib/oauth/store";
import { allowOAuthRequest } from "@/lib/oauth/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!(await allowOAuthRequest(request, "register", 20, 60 * 60))) {
      return oauthError("temporarily_unavailable", "Registration rate limit exceeded", 429);
    }
    if (Number(request.headers.get("content-length") ?? 0) > 20_000) {
      return oauthError("invalid_client_metadata", "Registration payload is too large");
    }
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = parseRegistration(body);
    const clientId = randomToken(24);
    const clientSecret = parsed.tokenEndpointAuthMethod === "none" ? undefined : randomToken();
    const now = Math.floor(Date.now() / 1000);
    await oauthStore().putClient(
      {
        clientId,
        clientSecretHash: clientSecret ? sha256(clientSecret) : undefined,
        clientName: parsed.clientName,
        redirectUris: parsed.redirectUris,
        tokenEndpointAuthMethod: parsed.tokenEndpointAuthMethod,
        createdAt: now,
      },
      365 * 24 * 60 * 60,
    );
    return jsonResponse(
      {
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
        client_id_issued_at: now,
        redirect_uris: parsed.redirectUris,
        client_name: parsed.clientName,
        token_endpoint_auth_method: parsed.tokenEndpointAuthMethod,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      201,
    );
  } catch (error) {
    return oauthError(
      "invalid_client_metadata",
      error instanceof Error ? error.message : "Invalid client metadata",
    );
  }
}
