import { jsonResponse } from "@/lib/http";
import { configurationStatus } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = configurationStatus();
  return jsonResponse(
    {
      service: "gsc-mcp-gateway",
      status: status.ready ? "ready" : "configuration_required",
      checks: status,
    },
    status.ready ? 200 : 503,
  );
}
