import { safeFormData } from "@/lib/http";
import {
  approveAuthorization,
  createAuthorizationFormToken,
  validateAuthorizationQuery,
} from "@/lib/oauth/authorize";
import { authorizationPage } from "@/lib/oauth/html";
import { verifyAuthorizationRequest } from "@/lib/oauth/crypto";
import { oauthStore } from "@/lib/oauth/store";
import { allowOAuthRequest } from "@/lib/oauth/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const validated = await validateAuthorizationQuery(new URL(request.url).searchParams, request);
    const client = await oauthStore().getClient(validated.clientId);
    const formToken = await createAuthorizationFormToken(validated, request);
    return authorizationPage({
      formToken,
      clientName: client?.clientName ?? "MCP client",
      scopes: validated.scopes,
    });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Invalid authorization request", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}

export async function POST(request: Request) {
  if (!(await allowOAuthRequest(request, "authorize", 10, 10 * 60))) {
    return new Response("Too many authorization attempts", {
      status: 429,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const form = await safeFormData(request);
  const formToken = form.get("request") ?? "";
  try {
    const callback = await approveAuthorization(formToken, form.get("password") ?? undefined, request);
    return Response.redirect(callback, 302);
  } catch (error) {
    let clientName = "MCP client";
    let scopes: string[] = [];
    try {
      const payload = await verifyAuthorizationRequest(formToken, request);
      const client = await oauthStore().getClient(String(payload.clientId ?? ""));
      clientName = client?.clientName ?? clientName;
      scopes = Array.isArray(payload.scopes) ? payload.scopes.map(String) : [];
    } catch {
      return new Response("Invalid or expired authorization request", { status: 400 });
    }
    return authorizationPage({
      formToken,
      clientName,
      scopes,
      error: error instanceof Error ? error.message : "Access denied",
    });
  }
}
