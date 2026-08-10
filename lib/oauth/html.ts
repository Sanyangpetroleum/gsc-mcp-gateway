import { noStoreHeaders } from "@/lib/http";

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

export function authorizationPage(input: {
  formToken: string;
  clientName: string;
  scopes: string[];
  error?: string;
}) {
  const error = input.error
    ? `<p role="alert" style="color:#a40000">${escapeHtml(input.error)}</p>`
    : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorise GSC MCP Gateway</title></head>
<body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<main><h1>Authorise read-only Search Console access</h1>
<p><strong>${escapeHtml(input.clientName)}</strong> is requesting access to the central GSC MCP gateway.</p>
<p>Permission: read Search Console properties, performance, URL inspection results and sitemap status.</p>
<p>Google credentials remain on the gateway and are never sent to the client.</p>
${error}
<form method="post" action="/oauth/authorize">
<input type="hidden" name="request" value="${escapeHtml(input.formToken)}">
<label for="password">Gateway access password</label><br>
<input id="password" name="password" type="password" autocomplete="current-password" required style="width:100%;padding:.7rem;margin:.4rem 0 1rem">
<button type="submit" style="padding:.7rem 1rem">Authorise</button>
</form></main></body></html>`;
  return new Response(html, {
    status: input.error ? 401 : 200,
    headers: { "Content-Type": "text/html; charset=utf-8", ...noStoreHeaders },
  });
}
