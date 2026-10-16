import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createGscClientFromEnv } from "@/lib/gsc/client";
import { safeToolError } from "@/lib/gsc/errors";
import {
  MCP_SITEMAP_WRITE_SCOPE, allowedSitemapProperties,
  createSitemapWriterFromEnv, sitemapWriteConfigured, validateSitemapSubmission, validateSitemapUrlSyntax,
} from "@/lib/gsc/sitemap-write";

export function registerSitemapTools(server: McpServer) {
  // This diagnostic never requires write permission and is available to the
  // existing gsc.read clients, including before optional writer activation.
  server.registerTool(
    "gsc_sitemap_readiness",
    {
      title: "Check Google Sitemap registration and write readiness",
      description: "READ ONLY. Verify a clean canonical Sitemap URL, current Google registration and last submission/download metadata. Distinguishes ready-to-submit from already-registered; never requests indexing or changes Google permissions.",
      inputSchema: z.object({
        property: z.string().min(1).max(2048),
        sitemapUrl: z.string().url().max(2048),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      const started = Date.now();
      try {
        validateSitemapUrlSyntax(input.property, input.sitemapUrl);
        const listed = await createGscClientFromEnv().listSitemaps(input.property);
        const match = listed.sitemaps.find((item) => item.path === input.sitemapUrl);
        const writerReady = sitemapWriteConfigured() &&
          allowedSitemapProperties().has(input.property);
        const data = {
          property: input.property,
          sitemapUrl: input.sitemapUrl,
          registered: Boolean(match),
          lastSubmitted: match?.lastSubmitted ?? null,
          lastDownloaded: match?.lastDownloaded ?? null,
          isPending: match?.isPending ?? null,
          errors: match?.errors ?? null,
          warnings: match?.warnings ?? null,
          gatedWriterConfiguredForProperty: writerReady,
          nextAction: match
            ? "Sitemap is already registered. Update its content when publishing and monitor Google's next download; resubmit only when useful."
            : writerReady
              ? "After confirming the XML is live, use the separately authorized gsc_submit_sitemap tool."
              : "Submit the sitemap manually or complete the distinct Google writer authorization; read-only credentials cannot submit.",
          limitation: "A registered sitemap does not guarantee discovery, crawling, or indexing. This is Google-recorded status, not a live content fetch.",
        };
        console.info(JSON.stringify({
          event: "mcp_tool", tool: "gsc_sitemap_readiness",
          timestamp: new Date().toISOString(), success: true,
          latencyMs: Date.now() - started, googleStatusCategory: "success",
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(data) }],
          structuredContent: data,
        };
      } catch (error) {
        const safe = safeToolError(error);
        console.warn(JSON.stringify({
          event: "mcp_tool", tool: "gsc_sitemap_readiness",
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
