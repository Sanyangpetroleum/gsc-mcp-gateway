import { describe, expect, it } from "vitest";
import { safeFormData, safeJson } from "@/lib/http";

describe("bounded request parsing", () => {
  it("accepts small JSON objects and form bodies", async () => {
    await expect(safeJson(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"ok":true}',
    }))).resolves.toEqual({ ok: true });
    const form = await safeFormData(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "a=b",
    }));
    expect(form.get("a")).toBe("b");
  });

  it("rejects oversized declared and streamed bodies", async () => {
    await expect(safeJson(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "20001" },
      body: "{}",
    }))).rejects.toThrow("too large");
    await expect(safeFormData(new Request("https://example.test", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `a=${"x".repeat(20_001)}`,
    }))).rejects.toThrow("too large");
  });
});
