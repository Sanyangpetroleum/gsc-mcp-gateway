import { publicBaseUrl } from "@/lib/config";
import { jsonResponse } from "@/lib/http";
import { MCP_SCOPE, OFFLINE_SCOPE } from "@/lib/oauth/crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const issuer = publicBaseUrl(request);
  return jsonResponse({
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    scopes_supported: [MCP_SCOPE, OFFLINE_SCOPE],
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: false,
  });
}
