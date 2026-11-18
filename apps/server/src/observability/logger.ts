import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { LoggerService } from "@nestjs/common";

type RecordFields = {
  requestId?: string;
  jobId?: string;
  sourceId?: string;
  code?: string;
  durationMs?: number;
  route?: string;
  status?: number;
  dbQueries?: number;
  stage?: string;
  attempts?: number;
  willRetry?: boolean;
  day?: number;
  slot?: string;
};
type LogScope = { records: string[]; fields: RecordFields; queryCount?: number };
export const logContext = new AsyncLocalStorage<LogScope>();
const encoder = new TextEncoder();
export function logEvent(
  event: string,
  severity: "info" | "warn" | "error",
  fields: RecordFields = {},
) {
  const sink = process.env.LOG_SINK ?? "cloudflare";
  if (sink === "off") return;
  // Explicit allowlist: never serialize exceptions, messages, URLs or arbitrary payloads.
  const merged = { ...logContext.getStore()?.fields, ...fields };
  const record: Record<string, unknown> = {
    event: /^[a-z_.]{1,80}$/.test(event) ? event : "application.error",
    severity,
    time: new Date().toISOString(),
  };
  for (const key of ["requestId", "jobId", "sourceId", "code", "stage", "slot"] as const) {
    const value = merged[key];
    if (typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value))
      record[key] = value;
  }
  if (
    typeof merged.durationMs === "number" &&
    Number.isFinite(merged.durationMs)
  )
    record.durationMs = Math.max(0, Math.round(merged.durationMs));
  if (merged.route && /^[a-zA-Z0-9_/:.-]{1,100}$/.test(merged.route))
    record.route = merged.route;
  for (const key of ["status", "dbQueries", "attempts", "day"] as const) {
    const value = merged[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
      record[key] = value;
  }
  if (typeof merged.willRetry === "boolean")
    record.willRetry = merged.willRetry;
  const line = JSON.stringify(record);
  if (encoder.encode(line).length > 4096) return;
  if (sink === "grafana") {
    const scope = logContext.getStore();
    if (scope && scope.records.length < 20) scope.records.push(line);
    else if (!scope) void flushLogs([line]);
    return;
  }
  if (sink === "cloudflare") console[severity](line);
}
export async function flushLogs(records: string[]) {
  if (process.env.LOG_SINK !== "grafana" || !records.length) return;
  try {
    const endpoint = new URL(process.env.GRAFANA_LOKI_URL ?? "");
    if (
      endpoint.protocol !== "https:" ||
      !endpoint.hostname.endsWith(".grafana.net") ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.pathname !== "/loki/api/v1/push"
    )
      return;
    const user = process.env.GRAFANA_LOKI_USER;
    const token = process.env.GRAFANA_LOKI_TOKEN;
    if (!user || !token) return;
    await fetch(endpoint, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(2000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`,
      },
      body: JSON.stringify({
        streams: [
          {
            stream: { service: "travel-planner-api" },
            values: records
              .slice(0, 20)
              .map((line, i) => [
                (BigInt(Date.now()) * 1000000n + BigInt(i)).toString(),
                line,
              ]),
          },
        ],
      }),
    });
  } catch {
    /* Best effort, no retries, no recursive logging and no business failures. */
  }
}
export async function withWorkerLogs<T>(
  waitUntil: (task: Promise<unknown>) => void,
  work: () => Promise<T>,
  scheduled = false,
): Promise<T> {
  const scope: LogScope = { records: [], fields: { requestId: randomUUID() } };
  const start = Date.now();
  return logContext.run(scope, async () => {
    try {
      return await work();
    } catch (error) {
      logEvent(scheduled ? "job.failed" : "request.failed", "error", {
        durationMs: Date.now() - start,
      });
      throw process.env.NODE_ENV === "production"
        ? new Error("Worker invocation failed")
        : error;
    } finally {
      waitUntil(flushLogs(scope.records));
    }
  });
}
export class SafeNestLogger implements LoggerService {
  log() {}
  debug() {}
  verbose() {}
  fatal() {
    logEvent("nest.fatal", "error");
  }
  warn() {
    logEvent("nest.warning", "warn");
  }
  error() {
    logEvent("nest.error", "error");
  }
}
