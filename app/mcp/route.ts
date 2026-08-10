import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerGscTools } from "@/lib/mcp/tools";
import { MCP_SCOPE, verifyAccessToken } from "@/lib/oauth/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => registerGscTools(server),
  {
    serverInfo: { name: "gsc-mcp-gateway", version: "0.1.0" },
    instructions: "Read-only Google Search Console data gateway. Use gsc_list_properties first when the exact property identifier is unknown. Never claim the API is exhaustive, and distinguish finalized from fresh/incomplete data.",
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
