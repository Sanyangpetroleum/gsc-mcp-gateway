import { publicBaseUrl, requiredEnv } from "@/lib/config";
import { oauthStore } from "./store";
import {
  MCP_SCOPE,
  OFFLINE_SCOPE,
  randomToken,
  safeSecretEquals,
  sha256,
  signAuthorizationRequest,
  verifyAuthorizationRequest,
} from "./crypto";

const BASE64URL_CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;

export interface ValidatedAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  scopes: string[];
  resource: string;
}

export async function validateAuthorizationQuery(
  params: URLSearchParams,
  request: Request,
): Promise<ValidatedAuthorizationRequest> {
  if (params.get("response_type") !== "code") throw new Error("response_type must be code");
  const clientId = params.get("client_id") ?? "";
  const client = await oauthStore().getClient(clientId);
  if (!client) throw new Error("Unknown OAuth client");
  const redirectUri = params.get("redirect_uri") ?? "";
  if (!client.redirectUris.includes(redirectUri)) throw new Error("redirect_uri is not registered");
  const state = params.get("state") ?? "";
  if (!state || state.length > 2048) throw new Error("state is required");
  const codeChallenge = params.get("code_challenge") ?? "";
  if (params.get("code_challenge_method") !== "S256" || !BASE64URL_CHALLENGE.test(codeChallenge)) {
    throw new Error("PKCE with code_challenge_method S256 is required");
  }
  const resource = params.get("resource");
  const expectedResource = `${publicBaseUrl(request)}/mcp`;
  if (resource !== expectedResource) throw new Error("The exact MCP resource parameter is required");
  const requestedScopes = (params.get("scope") ?? MCP_SCOPE).split(/\s+/).filter(Boolean);
  const allowed = new Set([MCP_SCOPE, OFFLINE_SCOPE]);
  if (!requestedScopes.includes(MCP_SCOPE) || requestedScopes.some((scope) => !allowed.has(scope))) {
    throw new Error("Unsupported OAuth scope");
  }
  return { clientId, redirectUri, state, codeChallenge, scopes: requestedScopes, resource };
}

export async function createAuthorizationFormToken(
  validated: ValidatedAuthorizationRequest,
  request: Request,
) {
  return signAuthorizationRequest({ ...validated }, request);
}

export async function approveAuthorization(
  formToken: string,
  password: string | undefined,
  request: Request,
) {
  if (!safeSecretEquals(password, requiredEnv("MCP_ADMIN_PASSWORD"))) {
    throw new Error("Access denied");
  }
  const payload = await verifyAuthorizationRequest(formToken, request);
  const clientId = String(payload.clientId ?? "");
  const redirectUri = String(payload.redirectUri ?? "");
  const state = String(payload.state ?? "");
  const codeChallenge = String(payload.codeChallenge ?? "");
  const scopes = Array.isArray(payload.scopes) ? payload.scopes.map(String) : [];
  const resource = String(payload.resource ?? "");
  if (resource !== `${publicBaseUrl(request)}/mcp`) throw new Error("Invalid OAuth resource");
  const client = await oauthStore().getClient(clientId);
  if (!client || !client.redirectUris.includes(redirectUri)) throw new Error("OAuth client is no longer valid");
  const code = randomToken();
  await oauthStore().putAuthorizationCode(
    sha256(code),
    { clientId, redirectUri, codeChallenge, scopes, subject: "gsc-gateway-owner", resource },
    120,
  );
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  callback.searchParams.set("iss", publicBaseUrl(request));
  return callback.toString();
}
