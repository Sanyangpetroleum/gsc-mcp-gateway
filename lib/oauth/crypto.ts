import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { publicBaseUrl, requiredEnv } from "@/lib/config";

export const MCP_SCOPE = "gsc.read";
export const OFFLINE_SCOPE = "offline_access";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export function safeSecretEquals(actual: string | undefined, expected: string) {
  if (!actual) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function signingKey() {
  const raw = requiredEnv("MCP_TOKEN_SIGNING_SECRET");
  const key = Buffer.from(raw, "base64url");
  if (key.length < 32) throw new Error("Required server configuration is invalid: MCP_TOKEN_SIGNING_SECRET");
  return key;
}

export async function issueAccessToken(input: {
  clientId: string;
  subject: string;
  scopes: string[];
  request?: Request;
}) {
  const issuer = publicBaseUrl(input.request);
  return new SignJWT({ scope: input.scopes.join(" "), client_id: input.clientId })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setIssuer(issuer)
    .setAudience(`${issuer}/mcp`)
    .setSubject(input.subject)
    .setJti(randomToken(16))
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(signingKey());
}

export async function verifyAccessToken(token: string, request?: Request) {
  const issuer = publicBaseUrl(request);
  const { payload } = await jwtVerify(token, signingKey(), {
    issuer,
    audience: `${issuer}/mcp`,
    algorithms: ["HS256"],
  });
  const scopes = typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [];
  if (!scopes.includes(MCP_SCOPE)) throw new Error("Missing required scope");
  return {
    token,
    clientId: typeof payload.client_id === "string" ? payload.client_id : "unknown",
    scopes,
    expiresAt: payload.exp,
    extra: { subject: payload.sub },
  };
}

export async function signAuthorizationRequest(
  claims: Record<string, unknown>,
  request?: Request,
) {
  const issuer = publicBaseUrl(request);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(`${issuer}/oauth/authorize`)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signingKey());
}

export async function verifyAuthorizationRequest(token: string, request?: Request) {
  const issuer = publicBaseUrl(request);
  const { payload } = await jwtVerify(token, signingKey(), {
    issuer,
    audience: `${issuer}/oauth/authorize`,
    algorithms: ["HS256"],
  });
  return payload;
}
