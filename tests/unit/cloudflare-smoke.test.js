import { describe, it, expect } from "vitest";
import { checkCloudflare } from "../../scripts/smoke-cloudflare.mjs";

const health = {
  status: "ok",
  services: { postgres: "ok" },
  deploy_commit: "new",
};
function server(overrides = {}) {
  const responses = {
    "/health": health,
    "/api/planning/config": { enabled: true, schema_version: 2 },
    "/api/planning/validate": { valid: true, issues: [] },
    ...overrides,
  };
  return async (url) => {
    const value = responses[url.pathname];
    return new Response(JSON.stringify(value), {
      status: value === null ? 404 : 200,
    });
  };
}

describe("Cloudflare deployment smoke checks", () => {
  it("accepts the expected revision with healthy database and planner", async () => {
    await expect(
      checkCloudflare("https://example.test", "new", server()),
    ).resolves.toBeUndefined();
  });
  it("rejects an old Worker even when health is green", async () => {
    await expect(
      checkCloudflare("https://example.test", "old", server()),
    ).rejects.toThrow("expected commit");
  });
  it("rejects the missing planning endpoint reported in production", async () => {
    await expect(
      checkCloudflare(
        "https://example.test",
        "new",
        server({ "/api/planning/validate": null }),
      ),
    ).rejects.toThrow("HTTP 404");
  });
  it("rejects database failure", async () => {
    await expect(
      checkCloudflare(
        "https://example.test",
        "new",
        server({ "/health": { ...health, services: {} } }),
      ),
    ).rejects.toThrow("Database health");
  });
  it("rejects a disabled planner or an incompatible response", async () => {
    await expect(
      checkCloudflare(
        "https://example.test",
        "new",
        server({
          "/api/planning/config": { enabled: false, schema_version: 2 },
        }),
      ),
    ).rejects.toThrow("configuration");
    await expect(
      checkCloudflare(
        "https://example.test",
        "new",
        server({ "/api/planning/validate": {} }),
      ),
    ).rejects.toThrow("contract");
  });
});
