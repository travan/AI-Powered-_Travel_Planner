import { mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseFallbackSources } from "../../packages/ai/fallback-config.mjs";
import { fallbackSources } from "../../apps/server/src/modules/itinerary/generation/supplement-fallback";

const source = { id: "gemini-1", provider: "gemini", model: "gemini-2.5-flash", key_env: "GEMINI_API_KEY" };

describe("shared deployment and runtime fallback configuration", () => {
  it.each([
    { provider: "gemini", key_env: "GEMINI_API_KEY" },
    { provider: "openai", key_env: "OPENAI_API_KEY_ACCOUNT_2" },
    { provider: "claude", key_env: `ANTHROPIC_API_KEY_${"A".repeat(30)}` },
  ])("accepts safe references for $provider", (reference) => {
    const sources = [{ ...source, ...reference }];
    const json = JSON.stringify(sources);
    expect(parseFallbackSources(json)).toEqual(sources);
    expect(fallbackSources(json)).toEqual(sources);
  });

  it.each([
    "{",
    "null",
    "{}",
    JSON.stringify([null]),
    JSON.stringify([source, source]),
    ...[
      { id: "primary" },
      { id: "bad id" },
      { model: "model with spaces" },
      { provider: "toString" },
      { provider: "cloudflare" },
      { provider: ["gemini"] },
      { key_env: "JWT_SECRET" },
      { key_env: "OPENAI_API_KEY" },
      { key_env: "GEMINI_API_KEY_" },
      { key_env: "GEMINI_API_KEY_lowercase" },
      { key_env: `GEMINI_API_KEY_${"A".repeat(31)}` },
    ].map((override) => JSON.stringify([{ ...source, ...override }])),
  ])("rejects unsafe configuration in both environments: %s", (json) => {
    expect(() => parseFallbackSources(json)).toThrow();
    expect(() => fallbackSources(json)).toThrowError(expect.objectContaining({ code: "AI_PROVIDER_CONFIGURATION_INVALID" }));
  });

  it("enforces source limits even when no fallback is configured", () => {
    for (const limit of [0, 21, 1.5, NaN]) {
      expect(() => parseFallbackSources(undefined, limit)).toThrow();
      expect(() => fallbackSources(undefined, limit)).toThrow();
    }
    const sources = [source, { ...source, id: "gemini-2" }];
    expect(() => parseFallbackSources(JSON.stringify(sources), 1)).toThrow();
    expect(() => fallbackSources(JSON.stringify(sources), 1)).toThrow();
    expect(parseFallbackSources(undefined)).toEqual([]);
    expect(fallbackSources("  ")).toEqual([]);
  });

  it("runs the Node deployment entry point with shared validation before writing config", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "fallback-config-test-"));
    const script = fileURLToPath(new URL("../../apps/server/cloudflare/prepare-queue-config.mjs", import.meta.url));
    mkdirSync(path.join(directory, "apps/server"), { recursive: true });
    const deploy = (sources: unknown[], limit = "5") => spawnSync(process.execPath, [script, "production"], {
      cwd: directory,
      env: {
        ...process.env,
        DEPLOY_AI_PROVIDER: "cloudflare",
        DEPLOY_AI_FALLBACK_PROVIDERS: JSON.stringify(sources),
        DEPLOY_AI_FALLBACK_MAX_SOURCES: limit,
        JOURNEY_QUEUE_CONCURRENCY: "1",
        PLANNING_AI_CONCURRENCY: "1",
        PLANNING_V2_PERCENT: "100",
      },
      encoding: "utf8",
    });
    const output = path.join(directory, "apps/server/wrangler.generated.json");
    try {
      const invalid = deploy([{ ...source, key_env: "JWT_SECRET" }]);
      expect(invalid.status).not.toBe(0);
      expect(invalid.stderr).toContain("Invalid fallback source");
      expect(() => readFileSync(output)).toThrow();
      const invalidProvider = deploy([{ ...source, provider: ["gemini"] }]);
      expect(invalidProvider.status).not.toBe(0);
      expect(invalidProvider.stderr).toContain("Invalid fallback source");
      const invalidLimit = deploy([], "0");
      expect(invalidLimit.status).not.toBe(0);
      expect(invalidLimit.stderr).toContain("AI fallback limit");
      const valid = deploy([source]);
      expect(valid.stderr).toBe("");
      expect(valid.status).toBe(0);
      const config = JSON.parse(readFileSync(output, "utf8"));
      expect(fallbackSources(config.vars.AI_FALLBACK_PROVIDERS)).toEqual([source]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
