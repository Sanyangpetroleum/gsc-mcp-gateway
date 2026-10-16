import { GoogleAuth } from "google-auth-library";
import { GoogleApiError, toGoogleApiError } from "@/lib/gsc/errors";
import { validateInspectionUrl, validateProperty } from "@/lib/gsc/validation";
import { federationConfig, federationConfigured, federatedScopedGscTokenProvider } from "@/lib/gsc/wif";

const GOOGLE_WRITE_SCOPE = "https://www.googleapis.com/auth/webmasters";
const API_BASE = "https://www.googleapis.com/webmasters/v3/sites/";

export const MCP_SITEMAP_WRITE_SCOPE = "gsc.sitemaps.write";

const SERVICE_ACCOUNT_EMAIL = /^[a-z0-9._-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/;

/** A write identity is always separate from the existing read-only Google identity. */
export function sitemapWriteConfigured(env: Record<string, string | undefined> = process.env) {
  const authMode = env.GSC_SITEMAP_WRITE_AUTH_MODE?.trim() || "service_account_json";
  let googleWriterReady = false;
  if (authMode === "vercel_oidc" && federationConfigured(env)) {
    const writerEmail = env.GCP_SITEMAP_WRITE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
    googleWriterReady =
      SERVICE_ACCOUNT_EMAIL.test(writerEmail) &&
      writerEmail !== federationConfig(env).serviceAccountEmail;
  } else if (authMode === "service_account_json") {
    googleWriterReady = Boolean(env.GSC_SITEMAP_WRITE_SERVICE_ACCOUNT_JSON?.trim());
  }
  return env.GSC_SITEMAP_WRITE_ENABLED === "true" &&
    googleWriterReady &&
    Boolean(env.GSC_SITEMAP_WRITE_PROPERTIES?.trim()) &&
    Boolean(env.MCP_WRITE_ADMIN_PASSWORD?.trim()) &&
    env.MCP_WRITE_ADMIN_PASSWORD !== env.MCP_ADMIN_PASSWORD;
}

export function allowedSitemapProperties(env: Record<string, string | undefined> = process.env) {
  const values = (env.GSC_SITEMAP_WRITE_PROPERTIES ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (values.length < 1 || values.length > 20 || new Set(values).size !== values.length) {
    throw new Error("Required server configuration is invalid: GSC_SITEMAP_WRITE_PROPERTIES");
  }
  for (const property of values) validateProperty(property);
  return new Set(values);
}

export function validateSitemapUrlSyntax(property: string, sitemapUrl: string) {
  validateInspectionUrl(property, sitemapUrl);
  const url = new URL(sitemapUrl);
  if (
    url.protocol !== "https:" || url.username || url.password || url.port ||
    url.search || url.hash || url.href !== sitemapUrl ||
    !/(?:^|\/)[^/]*sitemap[^/]*\.xml(?:\.gz)?$/i.test(url.pathname)
  ) {
    throw new Error("Sitemap submission requires an exact HTTPS XML sitemap URL within the authorized property");
  }
  return sitemapUrl;
}

export function validateSitemapSubmission(
  property: string, sitemapUrl: string, allowed: ReadonlySet<string>,
) {
  validateProperty(property);
  if (!allowed.has(property)) {
    throw new GoogleApiError("This Search Console property is not enabled for Sitemap writes", 403, "permission");
  }
  return validateSitemapUrlSyntax(property, sitemapUrl);
}

export class GscSitemapWriter {
  constructor(
    private readonly tokenProvider: () => Promise<string>,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async submit(property: string, sitemapUrl: string) {
    const api = API_BASE +
      encodeURIComponent(property) + "/sitemaps/" + encodeURIComponent(sitemapUrl);
    const token = await this.tokenProvider();
    const response = await this.fetcher(api, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw await toGoogleApiError(response);
    return {
      property, sitemapUrl, submitted: true,
      googleHttpStatus: response.status,
      limitation: "Google accepted the sitemap notification; this does not mean any page was crawled or indexed.",
    };
  }
}

export function createSitemapWriterFromEnv() {
  if (!sitemapWriteConfigured()) {
    throw new Error("Required server configuration is invalid: Sitemap write is not enabled");
  }
  // Production gateway is already keyless: extend that same bounded federation
  // to a distinct writer service account, never upgrade the reader's scope.
  if (process.env.GSC_SITEMAP_WRITE_AUTH_MODE === "vercel_oidc") {
    const writerEmail = process.env.GCP_SITEMAP_WRITE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
    const readEmail = federationConfig().serviceAccountEmail;
    if (!SERVICE_ACCOUNT_EMAIL.test(writerEmail) || writerEmail === readEmail) {
      throw new Error("Required server configuration is invalid: Sitemap write must use a separate Google service account");
    }
    return new GscSitemapWriter(
      federatedScopedGscTokenProvider(GOOGLE_WRITE_SCOPE, writerEmail),
    );
  }

  // Backward-compatible service-account JSON mode for an explicitly authorized
  // legacy deployment. Do not introduce new persistent keys for Vercel WIF.
  let credential: Record<string, unknown>;
  try {
    credential = JSON.parse(process.env.GSC_SITEMAP_WRITE_SERVICE_ACCOUNT_JSON ?? "") as Record<string, unknown>;
  } catch {
    throw new Error("Required server configuration is invalid: GSC_SITEMAP_WRITE_SERVICE_ACCOUNT_JSON");
  }
  if (
    credential.type !== "service_account" ||
    typeof credential.client_email !== "string" ||
    typeof credential.private_key !== "string"
  ) {
    throw new Error("Required server configuration is invalid: GSC_SITEMAP_WRITE_SERVICE_ACCOUNT_JSON");
  }

  let readEmail: string | undefined;
  if (process.env.GSC_AUTH_MODE === "vercel_oidc") {
    readEmail = federationConfig().serviceAccountEmail;
  } else {
    try {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ??
        Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 ?? "", "base64").toString("utf8");
      readEmail = (JSON.parse(raw) as { client_email?: string }).client_email;
    } catch {
      throw new Error("Required server configuration is invalid: Google read service account");
    }
  }
  if (!readEmail || readEmail === credential.client_email) {
    throw new Error("Required server configuration is invalid: Sitemap write must use a separate Google service account");
  }
  const auth = new GoogleAuth({ credentials: credential, scopes: [GOOGLE_WRITE_SCOPE] });
  return new GscSitemapWriter(async () => {
    const client = await auth.getClient();
    const token = (await client.getAccessToken()).token;
    if (!token) throw new GoogleApiError("Google Search Console authentication failed", 401, "authentication");
    return token;
  });
}
