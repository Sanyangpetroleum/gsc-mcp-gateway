import { NextResponse } from "next/server";
import { createGscClientFromEnv } from "@/lib/gsc/client";
import { createSitemapWriterFromEnv } from "@/lib/gsc/sitemap-write";
import { approvedSitemapDeployment, verifyAuthorizedGithubDeployment } from "@/lib/gsc/deployment-sync";
import { safeToolError } from "@/lib/gsc/errors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const responseHeaders = { "Cache-Control": "no-store" };

/**
 * Optional machine-to-machine post-deployment Google Sitemap notifier.
 * Enabled only with an independently authorized Google writer and exact
 * signed GitHub Actions OIDC origin. No arbitrary URL input or token logging.
 */
export async function POST(request: Request) {
  const policy = approvedSitemapDeployment();
  if (!policy) {
    return NextResponse.json({ error: "GSC sitemap automation is not enabled" }, { status: 404, headers: responseHeaders });
  }

  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !auth.slice(7).trim()) {
    return NextResponse.json({ error: "GitHub deployment token required" }, { status: 401, headers: responseHeaders });
  }

  try {
    await verifyAuthorizedGithubDeployment(auth.slice(7).trim(), policy);
  } catch {
    // Never log the token, claims or endpoint input.
    console.warn(JSON.stringify({ event: "gsc_sitemap_auto_submit", success: false, errorCode: "unauthorized_deployment" }));
    return NextResponse.json({ error: "Unauthorized deployment" }, { status: 403, headers: responseHeaders });
  }

  try {
    // Preserve the reader's exact property access check and use only the
    // separate, allowlisted Google writer identity for this PUT request.
    await createGscClientFromEnv().assertPropertyAccess(policy.property);
    const result = await createSitemapWriterFromEnv().submit(policy.property, policy.sitemapUrl);
    console.info(JSON.stringify({
      event: "gsc_sitemap_auto_submit", success: true,
      googleStatusCategory: "success", timestamp: new Date().toISOString(),
    }));
    return NextResponse.json({
      accepted: result.submitted,
      googleHttpStatus: result.googleHttpStatus,
      limitation: "Google accepted a Sitemap submission; URLs are not necessarily crawled or indexed.",
    }, { status: 200, headers: responseHeaders });
  } catch (error) {
    const safe = safeToolError(error);
    console.warn(JSON.stringify({
      event: "gsc_sitemap_auto_submit", success: false,
      googleStatusCategory: safe.googleStatusCategory ?? "not_called",
      errorCode: safe.code,
    }));
    return NextResponse.json({ error: safe }, { status: 502, headers: responseHeaders });
  }
}
