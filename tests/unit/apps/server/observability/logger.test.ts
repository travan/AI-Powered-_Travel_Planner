import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SafeNestLogger,
  flushLogs,
  logEvent,
  withWorkerLogs,
} from "../../../../../apps/server/src/observability/logger";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("bounded private logging", () => {
  it("never serializes arbitrary error messages, PII, query strings or payloads", () => {
    vi.stubEnv("LOG_SINK", "cloudflare");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = new SafeNestLogger();
    (logger.error as (...args: unknown[]) => void)(
      new Error("password=private; email@example.com; code=oauth-secret"),
    );
    logEvent("request.failed", "error", {
      requestId: "req-1",
      durationMs: 20,
      password: "secret",
      url: "https://host?code=secret",
    } as never);
    expect(error.mock.calls.flat().join(" ")).not.toMatch(
      /private|secret|email@example/,
    );
    expect(Buffer.byteLength(error.mock.calls[1][0])).toBeLessThanOrEqual(4096);
  });
  it("does not output or export in off mode", async () => {
    vi.stubEnv("LOG_SINK", "off");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    logEvent("test.error", "warn");
    await flushLogs(["log"]);
    expect(warn).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("caps each invocation at 20 logs, uses waitUntil and does not duplicate to console", async () => {
    vi.stubEnv("LOG_SINK", "grafana");
    vi.stubEnv(
      "GRAFANA_LOKI_URL",
      "https://logs-prod.grafana.net/loki/api/v1/push",
    );
    vi.stubEnv("GRAFANA_LOKI_USER", "123");
    vi.stubEnv("GRAFANA_LOKI_TOKEN", "private");
    const fetcher = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    vi.stubGlobal("fetch", fetcher);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tasks: Promise<unknown>[] = [];
    expect(
      await withWorkerLogs(
        (p) => tasks.push(p),
        async () => {
          for (let i = 0; i < 100; i++) logEvent("test.warn", "warn");
          return "ok";
        },
      ),
    ).toBe("ok");
    await Promise.all(tasks);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.streams[0].values).toHaveLength(20);
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
  });
  it("swallows exporter network failures without retry or business failure", async () => {
    vi.stubEnv("LOG_SINK", "grafana");
    vi.stubEnv(
      "GRAFANA_LOKI_URL",
      "https://logs-prod.grafana.net/loki/api/v1/push",
    );
    vi.stubEnv("GRAFANA_LOKI_USER", "123");
    vi.stubEnv("GRAFANA_LOKI_TOKEN", "private");
    const fetcher = vi.fn().mockRejectedValue(new Error("timeout"));
    vi.stubGlobal("fetch", fetcher);
    await expect(flushLogs(["{}"])).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
