import { publicBaseUrl } from "@/lib/config";
import { jsonResponse } from "@/lib/http";
import { MCP_SCOPE } from "@/lib/oauth/crypto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const issuer = publicBaseUrl(request);
  return jsonResponse({
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
  });
}
