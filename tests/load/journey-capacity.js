import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
import { SharedArray } from "k6/data";
import { Counter, Rate, Trend } from "k6/metrics";

const mode = __ENV.LOAD_MODE;
const base = __ENV.STAGING_API_ORIGIN;
const commit = __ENV.EXPECTED_DEPLOY_COMMIT;
if (
  !["burst", "mixed"].includes(mode) ||
  !/^https:\/\/[^/]+$/.test(base ?? "") ||
  !/^[0-9a-f]{40}$/.test(commit ?? "")
)
  throw new Error(
    "Set LOAD_MODE, STAGING_API_ORIGIN, and EXPECTED_DEPLOY_COMMIT.",
  );
const fixtures = new SharedArray("synthetic staging accounts", () =>
  JSON.parse(open(__ENV.STAGING_FIXTURES)),
);
if (
  fixtures.length !== 1000 ||
  new Set(fixtures.map(({ token }) => token)).size !== 1000 ||
  fixtures.some(
    ({ token, refreshToken, tripId }) =>
      !token || !refreshToken || (mode === "mixed" && !tripId),
  )
)
  throw new Error(
    "Provide 1,000 distinct staging tokens and a readable test trip for mixed mode.",
  );
const jobInput = JSON.parse(open(__ENV.STAGING_PLANNER_INPUT));
const accepted = new Counter("journey_accepted");
const completed = new Counter("journey_terminal");
const successful = new Counter("journey_successful");
const errors = new Rate("application_5xx");
const readSuccess = new Rate("read_success");
const throttled = new Rate("application_429");
const polls = new Counter("journey_status_reads");
const readLatency = new Trend("api_read_latency", true);
const firstClaim = new Trend("first_claim_latency", true);
const drain = new Trend("terminal_from_start", true);
const expected = mode === "burst" ? 1000 : 100;

export const options = {
  scenarios: {
    users: {
      executor: "per-vu-iterations",
      vus: 1000,
      iterations: 1,
      maxDuration: mode === "burst" ? "31m" : "16m",
    },
  },
  thresholds: {
    checks: ["rate==1"],
    application_5xx: ["rate<0.005"],
    read_success: ["rate>0.995"],
    api_read_latency: ["p(95)<500"],
    journey_accepted: [`count==${expected}`],
    journey_terminal: [`count==${expected}`],
    journey_successful: [`count==${expected}`],
    terminal_from_start: [mode === "burst" ? "max<=1800000" : "max<=900000"],
    ...(mode === "mixed" ? { first_claim_latency: ["p(95)<=120000"] } : {}),
    ...(__ENV.BASELINE_STATUS_READS
      ? {
          journey_status_reads: [
            `count<=${Math.floor(Number(__ENV.BASELINE_STATUS_READS) * 0.3)}`,
          ],
        }
      : {}),
  },
  discardResponseBodies: true,
};

export function setup() {
  const health = http.get(`${base}/health`, { responseType: "text" });
  if (
    health.status !== 200 ||
    health.json("deploy_commit") !== commit ||
    health.json("journey_load_test") !== true
  )
    throw new Error(
      "Expected the selected mock-only staging Worker and exact deployment commit.",
    );
  return { startAt: Date.now() + 20_000 };
}

function record(response, read = false) {
  errors.add(response.status >= 500 ? 1 : 0);
  throttled.add(response.status === 429);
  if (read) {
    readSuccess.add(response.status >= 200 && response.status < 300);
    readLatency.add(response.timings.duration);
  }
  return response;
}

function read(path, headers, responseType = "none") {
  return record(
    http.get(`${base}${path}`, { headers, responseType, timeout: "15s" }),
    true,
  );
}

export default function ({ startAt }) {
  const index = exec.vu.idInTest - 1;
  const fixture = fixtures[index];
  const headers = { Authorization: `Bearer ${fixture.token}` };
  let refreshToken = fixture.refreshToken;
  let refreshAt = startAt + 5 * 60_000 + Math.random() * 60_000;
  const refreshSession = () => {
    const response = record(
      http.post(
        `${base}/api/auth/refresh`,
        JSON.stringify({ refresh_token: refreshToken }),
        {
          headers: { "Content-Type": "application/json" },
          responseType: "text",
          timeout: "15s",
        },
      ),
    );
    if (!check(response, { "test session refreshed": (r) => r.status === 200 }))
      return false;
    const session = response.json("session");
    headers.Authorization = `Bearer ${session.access_token}`;
    refreshToken = session.refresh_token;
    refreshAt = Date.now() + 9 * 60_000 + Math.random() * 60_000;
    return true;
  };
  sleep(Math.max(0, (startAt - Date.now()) / 1000));
  let id;
  let submittedAt;
  let claimed = false;
  const sends = mode === "burst" || index < 100;
  const plannedSubmit = startAt + (mode === "burst" ? 0 : index * 3_000);
  let nextStatus = 0;
  let nextBadge = startAt + Math.random() * 60_000;
  let delay = 5;
  const deadline = startAt + (mode === "burst" ? 1_800_000 : 900_000);
  while (Date.now() < deadline) {
    if (Date.now() >= refreshAt && !refreshSession()) break;
    if (sends && !submittedAt && Date.now() >= plannedSubmit) {
      submittedAt = Date.now();
      const response = record(
        http.post(`${base}/api/itinerary/generate`, JSON.stringify(jobInput), {
          headers: {
            ...headers,
            "Content-Type": "application/json",
            "Idempotency-Key": `load-${startAt}-${index}`,
          },
          responseType: "text",
          timeout: "30s",
        }),
      );
      if (
        check(response, {
          "admission returned a job": (r) =>
            r.status === 201 && typeof r.json("job_id") === "string",
        })
      ) {
        id = response.json("job_id");
        accepted.add(1);
        nextStatus = Date.now() + 5000;
      }
    }
    if (id && Date.now() >= nextStatus) {
      polls.add(1);
      const response = read(`/api/itinerary/jobs/${id}`, headers, "text");
      if (response.status === 200) {
        const status = response.json();
        if (!claimed && status.attempts > 0) {
          claimed = true;
          firstClaim.add(Date.now() - submittedAt);
        }
        if (status.status === "complete" || status.status === "failed") {
          completed.add(1);
          if (status.status === "complete") successful.add(1);
          drain.add(Date.now() - startAt);
          id = undefined;
        }
      }
      nextStatus = Date.now() + 1000 * delay * (0.85 + Math.random() * 0.3);
      delay = Math.min(30, delay * 2);
    }
    if (Date.now() >= nextBadge) {
      read("/api/notifications/unread", headers);
      if (mode === "mixed" && !sends) {
        if (index < 500)
          read(`/api/trips/${fixture.tripId}/workspace`, headers);
        else if (index < 800) read("/api/cities/search?q=Tokyo", headers);
        else read("/api/planning/requests", headers);
      }
      nextBadge = Date.now() + 55_000 + Math.random() * 10_000;
    }
    if (mode === "burst" && submittedAt && !id) break;
    sleep(1);
  }
}

export function handleSummary(data) {
  const rate = data.metrics.application_5xx?.values.rate ?? 1;
  const summary = {
    accepted: data.metrics.journey_accepted?.values.count ?? 0,
    terminal: data.metrics.journey_terminal?.values.count ?? 0,
    complete: data.metrics.journey_successful?.values.count ?? 0,
    p95ReadMs: data.metrics.api_read_latency?.values["p(95)"],
    maxDrainMs: data.metrics.terminal_from_start?.values.max,
    pollRequests: data.metrics.journey_status_reads?.values.count,
    http5xxRate: rate,
    http429Rate: data.metrics.application_429?.values.rate ?? 0,
  };
  return { stdout: JSON.stringify(summary, null, 2) + "\n" };
}
