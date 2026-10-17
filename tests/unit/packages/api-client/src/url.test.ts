import { describe, expect, it } from "vitest";
import { joinApiUrl, resolveApiBaseUrl, resolveApiUrl } from "@travel/api-client";

describe("shared API URL resolution", () => {
  it("uses a same-origin route in the browser when no public API base is configured", () => {
    expect(resolveApiUrl("api/trips", { isServer: false })).toBe("/api/trips");
  });

  it("uses the internal server URL for server-side requests", () => {
    expect(resolveApiUrl("/api/trips", {
      isServer: true,
      serverBaseUrl: "http://server:3001/",
    })).toBe("http://server:3001/api/trips");
  });

  it("prefers an explicitly configured public API URL", () => {
    expect(resolveApiUrl("/api/trips", {
      isServer: true,
      publicBaseUrl: "https://api.example.test/",
      serverBaseUrl: "http://server:3001",
    })).toBe("https://api.example.test/api/trips");
  });

  it("normalizes mobile base URLs and preserves absolute URLs", () => {
    expect(resolveApiBaseUrl("https://api.example.test///", "http://localhost:3001")).toBe("https://api.example.test");
    expect(joinApiUrl("https://api.example.test", "https://other.example.test/a")).toBe("https://other.example.test/a");
  });
});
