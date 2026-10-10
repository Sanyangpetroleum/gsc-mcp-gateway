import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerGscTools } from "@/lib/mcp/tools";
import { sitemapWriteConfigured } from "@/lib/gsc/sitemap-write";
import { MCP_SCOPE, verifyAccessToken } from "@/lib/oauth/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => registerGscTools(server),
  {
    serverInfo: { name: "gsc-mcp-gateway", version: "0.1.0" },
    instructions: "Google Search Console SEO Intelligence MCP. Use gsc_list_properties to select an exact accessible property. Data-driven keyword opportunities, page/editorial briefs, and property-specific trend changes are derived only from Search Console top rows: never invent global search volume, Google Trends growth, competitor data or indexing outcomes. Existing tools remain read-only. " + (sitemapWriteConfigured() ? "A separate, explicitly authorized write-only Sitemap submission tool is enabled for restricted properties; it cannot request indexing of ordinary articles." : "No Google write tools are enabled."),
    onEvent: (event) => {
      if (event.type === "REQUEST_COMPLETED") {
        console.info(JSON.stringify({
          event: "mcp_protocol",
          type: event.type,
          timestamp: new Date(event.timestamp).toISOString(),
          method: event.method,
          success: event.status === "success",
          latencyMs: event.duration,
        }));
      } else if (event.type === "ERROR") {
        console.info(JSON.stringify({
          event: "mcp_protocol",
          type: event.type,
          timestamp: new Date(event.timestamp).toISOString(),
          success: false,
          severity: event.severity,
        }));
      }
    },
  },
);

const authenticatedHandler = withMcpAuth(
  mcpHandler,
  async (request, bearerToken) => {
    if (!bearerToken) return undefined;
    return verifyAccessToken(bearerToken, request);
  },
  { required: true, requiredScopes: [MCP_SCOPE] },
);

export { authenticatedHandler as GET, authenticatedHandler as POST };
