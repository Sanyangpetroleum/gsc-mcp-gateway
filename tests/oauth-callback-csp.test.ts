import { describe, expect, it } from "vitest";
import { authorizationPage } from "@/lib/oauth/html";

const form = (registeredRedirectUri?: string, error?: string) =>
  authorizationPage({
    formToken: "signed-test-request",
    clientName: "ChatGPT",
    scopes: ["gsc.read"],
    registeredRedirectUri,
    error,
  });

describe("OAuth consent form callback CSP", () => {
  it("permits the HTTPS origin of the OAuth client's verified callback", () => {
    const response = form("https://chatgpt.com/connector_platform_oauth_redirect?state=opaque");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://chatgpt.com",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("allows only the registered origin, not an arbitrary extra origin", () => {
    const policy = form("https://chatgpt.com/oauth/callback").headers.get("Content-Security-Policy");
    expect(policy).not.toContain("https://evil.example");
    expect(policy).not.toContain("form-action *");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("default-src 'none'");
  });

  it("keeps self-only form-action for missing, malformed and unsafe callbacks", () => {
    for (const uri of [undefined, "", "not a url", "javascript:alert(1)", "http://arbitrary.example/callback"]) {
      expect(form(uri).headers.get("Content-Security-Policy")).toBe(
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      );
    }
  });

  it("retains support for already-permitted local loopback OAuth callbacks", () => {
    const policy = form("http://127.0.0.1:4567/oauth/callback").headers.get("Content-Security-Policy");
    expect(policy).toContain("form-action 'self' http://127.0.0.1:4567");
  });

  it("preserves verified callback navigation on failed authorization pages too", async () => {
    const response = form("https://chatgpt.com/oauth/callback", "Access denied");
    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Security-Policy")).toContain("form-action 'self' https://chatgpt.com");
    const html = await response.text();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Access denied");
    expect(html).toContain('action="/oauth/authorize"');
    expect(html).not.toContain("https://chatgpt.com/oauth/callback");
  });

  it("escapes untrusted client names and does not embed the callback into HTML", async () => {
    const response = authorizationPage({
      formToken: "safe",
      clientName: "<script>evil()</script>",
      scopes: ["gsc.read"],
      registeredRedirectUri: "https://chatgpt.com/a?code=sensitive",
    });
    const html = await response.text();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("code=sensitive");
  });
});
