import { publicBaseUrl } from "@/lib/config";
import { jsonResponse } from "@/lib/http";
import { MCP_SCOPE } from "@/lib/oauth/crypto";
import { MCP_SITEMAP_WRITE_SCOPE, sitemapWriteConfigured } from "@/lib/gsc/sitemap-write";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const issuer = publicBaseUrl(request);
  return jsonResponse({
    resource: `${issuer}/mcp`,
    authorization_servers: [issuer],
    scopes_supported: [MCP_SCOPE, ...(sitemapWriteConfigured() ? [MCP_SITEMAP_WRITE_SCOPE] : [])],
    bearer_methods_supported: ["header"],
  });
}
