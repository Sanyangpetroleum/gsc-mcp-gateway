import { oauthError, safeFormData, jsonResponse } from "@/lib/http";
import { authenticateClient, extractClientCredentials } from "@/lib/oauth/client";
import {
  issueAccessToken,
  OFFLINE_SCOPE,
  randomToken,
  sha256,
} from "@/lib/oauth/crypto";
import { oauthStore } from "@/lib/oauth/store";
import { allowOAuthRequest } from "@/lib/oauth/rate-limit";
import { publicBaseUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

async function tokenResponse(input: {
  clientId: string;
  subject: string;
  scopes: string[];
  request: Request;
  resource: string;
}) {
  const accessToken = await issueAccessToken(input);
  const includeRefresh = input.scopes.includes(OFFLINE_SCOPE);
  let refreshToken: string | undefined;
  if (includeRefresh) {
    refreshToken = randomToken();
    await oauthStore().putRefreshToken(
      sha256(refreshToken),
      {
        clientId: input.clientId,
        scopes: input.scopes,
        subject: input.subject,
        resource: input.resource,
      },
      30 * 24 * 60 * 60,
    );
  }
  return jsonResponse({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    scope: input.scopes.join(" "),
    ...(refreshToken ? { refresh_token: refreshToken } : {}),
  });
}

export async function POST(request: Request) {
  if (!(await allowOAuthRequest(request, "token", 60, 60))) {
    return oauthError("temporarily_unavailable", "Token endpoint rate limit exceeded", 429);
  }
  let form: URLSearchParams;
  try {
    form = await safeFormData(request);
  } catch (error) {
    return oauthError("invalid_request", error instanceof Error ? error.message : "Invalid request");
  }
  const credentials = extractClientCredentials(request, form);
  const client = await oauthStore().getClient(credentials.clientId);
  if (!client || !authenticateClient(client, credentials)) {
    return oauthError("invalid_client", "Client authentication failed", 401);
  }
  const resource = form.get("resource") ?? "";
  if (resource !== `${publicBaseUrl(request)}/mcp`) {
    return oauthError("invalid_target", "The exact MCP resource parameter is required");
  }
  const grantType = form.get("grant_type");
  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";
    if (!code || !verifier || !redirectUri) {
      return oauthError("invalid_request", "code, code_verifier and redirect_uri are required");
    }
    const record = await oauthStore().consumeAuthorizationCode(sha256(code));
    if (
      !record ||
      record.clientId !== client.clientId ||
      record.redirectUri !== redirectUri ||
      record.resource !== resource ||
      sha256(verifier) !== record.codeChallenge
    ) {
      return oauthError("invalid_grant", "Authorization code is invalid, expired or already used");
    }
    return tokenResponse({
      clientId: client.clientId,
      subject: record.subject,
      scopes: record.scopes,
      request,
      resource: record.resource,
    });
  }
  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token") ?? "";
    if (!refreshToken) return oauthError("invalid_request", "refresh_token is required");
    const record = await oauthStore().consumeRefreshToken(sha256(refreshToken));
    if (!record || record.clientId !== client.clientId || record.resource !== resource) {
      return oauthError("invalid_grant", "Refresh token is invalid, expired or already used");
    }
    return tokenResponse({
      clientId: client.clientId,
      subject: record.subject,
      scopes: record.scopes,
      request,
      resource: record.resource,
    });
  }
  return oauthError("unsupported_grant_type", "Supported grants are authorization_code and refresh_token");
}
