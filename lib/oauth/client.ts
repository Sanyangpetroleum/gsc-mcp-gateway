import { sha256, safeSecretEquals } from "./crypto";
import type { OAuthClientRecord, TokenEndpointAuthMethod } from "./types";

const ALLOWED_METHODS = new Set<TokenEndpointAuthMethod>([
  "none",
  "client_secret_basic",
  "client_secret_post",
]);

export function validateRedirectUri(value: string) {
  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    throw new Error("redirect_uris must contain valid absolute URLs");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(uri.hostname);
  if (uri.protocol !== "https:" && !(local && uri.protocol === "http:")) {
    throw new Error("redirect_uris must use HTTPS, except loopback localhost callbacks");
  }
  if (uri.hash) throw new Error("redirect_uris cannot contain fragments");
}

export function parseRegistration(input: Record<string, unknown>) {
  const redirectUris = input.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length < 1 || redirectUris.length > 10) {
    throw new Error("redirect_uris must contain 1 to 10 URLs");
  }
  if (!redirectUris.every((value) => typeof value === "string")) {
    throw new Error("redirect_uris must be strings");
  }
  redirectUris.forEach(validateRedirectUri);
  const method = (input.token_endpoint_auth_method ?? "none") as TokenEndpointAuthMethod;
  if (!ALLOWED_METHODS.has(method)) throw new Error("Unsupported token_endpoint_auth_method");
  return {
    redirectUris,
    tokenEndpointAuthMethod: method,
    clientName: typeof input.client_name === "string" ? input.client_name.slice(0, 200) : undefined,
  };
}

export function extractClientCredentials(request: Request, form: URLSearchParams) {
  const basic = request.headers.get("authorization");
  if (basic?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(basic.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      return {
        clientId: decodeURIComponent(decoded.slice(0, separator)),
        clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
        method: "client_secret_basic" as const,
      };
    } catch {
      return { clientId: "", clientSecret: "", method: "client_secret_basic" as const };
    }
  }
  return {
    clientId: form.get("client_id") ?? "",
    clientSecret: form.get("client_secret") ?? undefined,
    method: form.has("client_secret") ? ("client_secret_post" as const) : ("none" as const),
  };
}

export function authenticateClient(
  client: OAuthClientRecord,
  credentials: ReturnType<typeof extractClientCredentials>,
) {
  if (credentials.clientId !== client.clientId || credentials.method !== client.tokenEndpointAuthMethod) {
    return false;
  }
  if (client.tokenEndpointAuthMethod === "none") return true;
  return Boolean(
    client.clientSecretHash &&
      credentials.clientSecret &&
      safeSecretEquals(sha256(credentials.clientSecret), client.clientSecretHash),
  );
}
