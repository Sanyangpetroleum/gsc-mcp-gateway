import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createGscClientFromEnv } from "@/lib/gsc/client";
import { safeToolError } from "@/lib/gsc/errors";
import {
  MCP_SITEMAP_WRITE_SCOPE, allowedSitemapProperties,
  createSitemapWriterFromEnv, sitemapWriteConfigured, validateSitemapSubmission,
} from "@/lib/gsc/sitemap-write";

export function registerSitemapTools(server: McpServer) {
  // Default server deployments remain strictly read-only. This tool exists only after
  // separate operator opt-in, Google writer identity and exact property allowlist.
  if (!sitemapWriteConfigured()) return;
  server.registerTool(
    "gsc_submit_sitemap",
    {
      title: "Submit an authorized Sitemap to Google Search Console",
      description: "WRITE action. Submits an HTTPS XML sitemap for a specifically allowed Search Console property, NOT an arbitrary page indexing request. Requires separately authorized gsc.sitemaps.write OAuth scope and explicit confirmation. Google indexing is never guaranteed.",
      inputSchema: z.object({
        property: z.string().min(1).max(2048),
        sitemapUrl: z.string().url().max(2048),
        confirm: z.literal("SUBMIT_SITEMAP"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input, context) => {
      const started = Date.now();
      try {
        if (!sitemapWriteConfigured()) throw new Error("Sitemap write is disabled");
        if (!context.http?.authInfo?.scopes.includes(MCP_SITEMAP_WRITE_SCOPE)) {
          throw new Error("Explicit gsc.sitemaps.write OAuth authorization is required");
        }
        validateSitemapSubmission(
          input.property, input.sitemapUrl, allowedSitemapProperties(),
        );
        // Both identities must independently have the exact property before a write.
        await createGscClientFromEnv().assertPropertyAccess(input.property);
        const output = await createSitemapWriterFromEnv().submit(input.property, input.sitemapUrl);
        console.info(JSON.stringify({
          event: "mcp_tool", tool: "gsc_submit_sitemap",
          timestamp: new Date().toISOString(), success: true,
          latencyMs: Date.now() - started, googleStatusCategory: "success",
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(output) }],
          structuredContent: output,
        };
      } catch (error) {
        const safe = safeToolError(error);
        console.warn(JSON.stringify({
          event: "mcp_tool", tool: "gsc_submit_sitemap",
          timestamp: new Date().toISOString(), success: false,
          latencyMs: Date.now() - started,
          googleStatusCategory: safe.googleStatusCategory ?? "not_called",
          errorCode: safe.code,
        }));
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: safe }) }],
          structuredContent: { error: safe },
        };
      }
    },
  );
}
