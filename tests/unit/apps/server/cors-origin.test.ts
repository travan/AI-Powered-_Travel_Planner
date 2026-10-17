import { describe, expect, it } from "vitest";
import { isAllowedCorsOrigin } from "../../../../apps/server/src/cors-origin";

describe("isAllowedCorsOrigin", () => {
  const configured = new Set(["http://localhost:3000"]);

  it("accepts configured origins and requests without Origin", () => {
    expect(isAllowedCorsOrigin(undefined, configured, false)).toBe(true);
    expect(isAllowedCorsOrigin("http://localhost:3000", configured, false)).toBe(true);
  });

  it("accepts a changing Quick Tunnel hostname only when the development option is enabled", () => {
    const tunnel = "https://yards-nutrition-tool-friendship.trycloudflare.com";
    expect(isAllowedCorsOrigin(tunnel, configured, true)).toBe(true);
    expect(isAllowedCorsOrigin(tunnel, configured, false)).toBe(false);
  });

  it("rejects lookalike or insecure hosts", () => {
    for (const origin of [
      "http://demo.trycloudflare.com",
      "https://demo.trycloudflare.com.evil.example",
      "https://evil.example/trycloudflare.com",
      "https://demo.trycloudflare.com:8443",
    ]) {
      expect(isAllowedCorsOrigin(origin, configured, true)).toBe(false);
    }
  });
});
