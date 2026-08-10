import { oauthError, safeFormData } from "@/lib/http";
import { authenticateClient, extractClientCredentials } from "@/lib/oauth/client";
import { sha256 } from "@/lib/oauth/crypto";
import { oauthStore } from "@/lib/oauth/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
  const token = form.get("token");
  if (token) await oauthStore().deleteRefreshToken(sha256(token));
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
