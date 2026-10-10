import { noStoreHeaders } from "@/lib/http";
import { MCP_SITEMAP_WRITE_SCOPE } from "@/lib/gsc/sitemap-write";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

/**
 * Chromium checks form-action over the entire form submission redirect chain.
 * The POST /oauth/authorize success response is a 302 to the OAuth client's
 * registered redirect_uri; 'self' alone blocks that navigation in Chrome/Edge.
 *
 * Callers must pass ONLY a URI already validated against the registered OAuth
 * client (on GET) or a server-signed request and active registration (on POST).
 * Permit its origin only on this consent page. Keep all other CSP directives
 * and the POST target restricted to 'self'.
 */
function authorizationPageCsp(registeredRedirectUri?: string): string {
  let allowedCallbackOrigin: string | undefined;
  if (registeredRedirectUri) {
    try {
      const redirect = new URL(registeredRedirectUri);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
      if (redirect.protocol === "https:" || (redirect.protocol === "http:" && local)) {
        allowedCallbackOrigin = redirect.origin;
      }
    } catch {
      // Invalid callback URIs do not weaken the default policy.
    }
  }
  const formAction = allowedCallbackOrigin
    ? `form-action 'self' ${allowedCallbackOrigin}`
    : "form-action 'self'";
  return `default-src 'none'; frame-ancestors 'none'; base-uri 'none'; ${formAction}`;
}

export function authorizationPage(input: {
  formToken: string;
  clientName: string;
  scopes: string[];
  error?: string;
  /** Redirect URI verified against the OAuth client registration. */
  registeredRedirectUri?: string;
}) {
  const error = input.error
    ? `<p role="alert" style="color:#a40000">${escapeHtml(input.error)}</p>`
    : "";
  const writeRequested = input.scopes.includes(MCP_SITEMAP_WRITE_SCOPE);
  const heading = writeRequested
    ? "Authorise Search Console Sitemap submission"
    : "Authorise read-only Search Console access";
  const permission = writeRequested
    ? "Read Search Console data AND submit XML Sitemaps for individually allowlisted properties. This does not request indexing for ordinary articles. Write access requires a separate gateway approval password."
    : "Read Search Console properties, performance, URL inspection results, sitemap status and SEO recommendations; no write permissions.";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorise GSC MCP Gateway</title></head>
<body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<main><h1>${heading}</h1>
<p><strong>${escapeHtml(input.clientName)}</strong> is requesting access to the central GSC MCP gateway.</p>
<p>Permission: ${permission}</p>
<p>Google credentials remain on the gateway and are never sent to the client.</p>
${error}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="request" value="${escapeHtml(input.formToken)}">
<label for="password">${writeRequested ? "Separate gateway Sitemap-write password" : "Gateway read access password"}</label><br>
<input id="password" name="password" type="password" autocomplete="current-password" required style="width:100%;padding:.7rem;margin:.4rem 0 1rem">
<button type="submit" style="padding:.7rem 1rem">Authorise</button>
</form></main></body></html>`;
  return new Response(html, {
    status: input.error ? 401 : 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...noStoreHeaders,
      "Content-Security-Policy": authorizationPageCsp(input.registeredRedirectUri),
    },
  });
}
