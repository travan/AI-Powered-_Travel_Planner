import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { canarySession } from "./production-canary-auth.mjs";
import { planningCanaryCases } from "./planning-canary-cases.mjs";

const key = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

export function validateCanaryPlan(plan, request) {
  assert.equal(plan.days?.length, request.num_days, "Wrong day count");
  assert.equal(plan.currency, request.currency, "Wrong currency");
  assert.ok(
    Number.isFinite(plan.total_cost) &&
      plan.total_cost > 0 &&
      plan.total_cost <= request.budget,
    "Invalid or over-budget successful plan",
  );
  assert.equal(plan.budget_breakdown?.complete, true, "Incomplete budget");
  const breakdown = plan.budget_breakdown;
  const costs = [
    "accommodation",
    "food",
    "activities",
    "transport",
    "contingency",
  ].map((category) => breakdown[category]);
  assert.ok(
    costs.every((amount) => Number.isFinite(amount) && amount >= 0),
    "Invalid budget component",
  );
  assert.ok(
    Math.abs(
      costs.reduce((sum, amount) => sum + amount, 0) - plan.total_cost,
    ) <= 1 && Math.abs(breakdown.total - plan.total_cost) <= 1,
    "Budget components do not reconcile",
  );
  assert.ok(
    !plan.issues?.some((issue) => issue.severity === "error"),
    "Successful plan contains blocking issues",
  );
  const stops = [];
  const visited = new Set();
  for (const [index, day] of plan.days.entries()) {
    assert.equal(day.day_number, index + 1, "Wrong day numbering");
    assert.match(day.date ?? "", /^\d{4}-\d{2}-\d{2}$/);
    if (request.flexible_month)
      assert.ok(
        day.date.startsWith(request.flexible_month),
        "Wrong travel month",
      );
    if (index)
      assert.equal(
        Date.parse(day.date) - Date.parse(plan.days[index - 1].date),
        86_400_000,
        "Dates are not consecutive",
      );
    assert.ok(
      day.city && !/^country-/i.test(day.city),
      "Country ID used as city",
    );
    const selected =
      day.destination_slug ??
      request.cities.find((id) => key(id) === key(day.city_slug ?? day.city));
    assert.ok(
      request.cities.includes(selected),
      "Day is outside selected destinations",
    );
    if (selected !== stops.at(-1)) stops.push(selected);
    const country = /^country-([a-z]{2})$/.exec(selected)?.[1]?.toUpperCase();
    const catalog = plan.city_catalog?.[day.city_slug];
    if (country)
      assert.equal(
        catalog?.country,
        country,
        "City country not verified by resolver/catalog",
      );
    let lastEnd = 0;
    for (const activity of day.activities ?? []) {
      const match = /^(\d{2}):(\d{2})$/.exec(activity.time ?? "");
      assert.ok(match, "Missing activity time");
      const start = Number(match[1]) * 60 + Number(match[2]);
      assert.ok(
        start >= lastEnd && Number(match[2]) < 60,
        "Overlapping activities",
      );
      assert.ok(
        Number.isFinite(activity.duration_minutes) &&
          activity.duration_minutes > 0,
        "Missing duration",
      );
      lastEnd = start + activity.duration_minutes;
      assert.ok(lastEnd <= 1440, "Activity extends beyond day");
      assert.ok(
        activity.name?.trim() && activity.description?.trim(),
        "Missing activity content",
      );
      assert.ok(
        Number.isFinite(activity.price?.amount) && activity.price.amount >= 0,
        "Unpriced activity",
      );
      if (activity.kind === "visit") {
        const venue = `${key(day.city)}:${key(activity.name)}`;
        assert.ok(!visited.has(venue), "Repeated sightseeing venue");
        visited.add(venue);
      }
    }
    const hasMainTravel = day.activities.some(
      (activity) => activity.main_transport,
    );
    if (index > 0 && index < request.num_days - 1 && !hasMainTravel) {
      assert.ok(
        day.activities.some((activity) => activity.kind === "visit"),
        "Full day has no sightseeing",
      );
      const meals = new Set(
        day.activities
          .filter((activity) => activity.kind === "meal")
          .map((activity) => activity.meal_slot),
      );
      assert.ok(
        ["breakfast", "lunch", "dinner"].every((meal) => meals.has(meal)),
        "Full day is missing meals",
      );
    }
  }
  assert.deepEqual(stops, request.cities, "Wrong destination order");
  const legs = plan.transport_summary ?? [];
  const origin = request.planning.journey.origin.label;
  assert.ok(
    key(legs[0]?.from).includes(key(origin)),
    "Missing outbound leg from origin",
  );
  const route = [
    origin,
    ...request.cities.map(
      (id) =>
        plan.days.find(
          (day) =>
            day.destination_slug === id || key(id) === key(day.city_slug),
        )?.city,
    ),
  ];
  if (request.planning.journey.return_to_origin) route.push(origin);
  else if (request.planning.journey.endpoint?.label)
    route.push(request.planning.journey.endpoint.label);
  for (let index = 1; index < route.length; index++) {
    assert.ok(
      legs.some(
        (leg) =>
          key(leg.from).includes(key(route[index - 1])) &&
          key(leg.to).includes(key(route[index])),
      ),
      "Missing main travel connection",
    );
  }
  for (const leg of legs)
    assert.ok(
      Number.isFinite(leg.price?.amount) && leg.price.amount >= 0,
      "Unpriced main travel connection",
    );
  if (request.planning.journey.return_to_origin)
    assert.ok(
      key(legs.at(-1)?.to).includes(key(origin)),
      "Missing return to origin",
    );
}

export function classifyCanaryResult(test, job, validationError) {
  if (job.status === "complete")
    return validationError ? "invalid_success" : "complete";
  if (
    test.allowConstraintFailure &&
    job.error_code === "PLANNING_BUDGET_UNSATISFIABLE" &&
    typeof job.error_params?.reason === "string"
  )
    return "constraint_rejected";
  return "failed";
}

export async function runProductionCanary({
  base,
  commit,
  runId,
  mode = "compare",
  request = fetch,
  sleep = delay,
  output = "test-results/production-generation",
}) {
  assert.ok(
    base && new URL(base).protocol === "https:",
    "HTTPS production API required",
  );
  assert.match(runId ?? "", /^[a-zA-Z0-9_-]{1,64}$/);
  assert.ok(["compare", "promoted"].includes(mode), "Unknown canary mode");
  const health = await request(new URL("/health", base), {
    signal: AbortSignal.timeout(20_000),
  }).then((response) => response.json());
  assert.equal(health.deploy_commit, commit, "Production commit mismatch");
  assert.equal(
    health.planning_pipeline?.queue_bound,
    true,
    "Production Queue is not bound",
  );
  assert.equal(
    health.planning_pipeline?.v2_percent,
    mode === "compare" ? 0 : 100,
    "Unexpected rollout percentage",
  );
  const session = await canarySession(base, { request });
  const cases = await planningCanaryCases();
  const reports = [];
  await fs.mkdir(output, { recursive: true });
  const save = () =>
    fs.writeFile(
      `${output}/${mode}.json`,
      JSON.stringify(
        {
          commit,
          runId,
          mode,
          health,
          cases: reports,
          summary: summarize(reports),
        },
        null,
        2,
      ) + "\n",
    );
  try {
    // Establish V2 results before spending tokens on the legacy baseline.
    for (const pipeline of mode === "compare" ? [2, 1] : [2]) {
      for (const test of mode === "compare" ? cases.slice(0, 3) : cases.filter((test) => ["short-da-nang", "ha-giang"].includes(test.id))) {
        const started = Date.now();
        const row = {
          case: test.id,
          pipeline,
          started_at: new Date().toISOString(),
          status: "failed",
          requests_submitted: 0,
        };
        reports.push(row);
        await save();
        try {
          const headers = {
            "Idempotency-Key": `${runId}-${mode}-${test.id}-v${pipeline}`,
            ...(mode === "compare"
              ? { "X-Planning-Pipeline": `v${pipeline}` }
              : {}),
          };
          // Only cache bypass differs from the immutable captured request fixture.
          const queued = await session.json("/api/itinerary/generate", {
            method: "POST",
            headers,
            body: JSON.stringify({ ...test.request, force_refresh: true }),
          });
          row.requests_submitted = 1;
          row.job_id = queued.job_id;
          assert.ok(row.job_id, "Missing job ID");
          await save();
          let job;
          let terminalAt;
          do {
            job = await session.json(`/api/itinerary/jobs/${row.job_id}`);
            if (["complete", "failed"].includes(job.status)) {
              row.error_code = job.error_code;
              row.error_params = job.error_params;
              terminalAt ??= Date.now();
              if (job.usage_recorded) break;
              assert.ok(
                Date.now() - terminalAt < 60_000,
                "Terminal job has no durable usage record; inference counts cannot be certified",
              );
            }
            assert.ok(
              Date.now() - started < 30 * 60_000,
              "Job exceeded 30-minute deadline",
            );
            await sleep(5_000);
          } while (true);
          Object.assign(row, {
            job_status: job.status,
            pipeline_actual: job.pipeline_version,
            provider: job.provider,
            model: job.model,
            calls: job.ai_usage?.length ?? 0,
            input_tokens: total(job.ai_usage, "input_tokens"),
            output_tokens: total(job.ai_usage, "output_tokens"),
            error_code: job.error_code,
            error_params: job.error_params,
          });
          assert.equal(
            job.pipeline_version,
            pipeline,
            "Job used the wrong pipeline",
          );
          if (pipeline === 2)
            assert.ok(row.calls <= 1, "V2 dispatched AI more than once");
          let validationError;
          if (job.status === "complete") {
            const result = await session.json(
              `/api/itinerary/${job.itinerary_id}`,
            );
            const plan = result.itineraries?.[0];
            try {
              validateCanaryPlan(plan, test.request);
            } catch (error) {
              validationError = error.message;
            }
            await fs.writeFile(
              `${output}/${mode}-${test.id}-v${pipeline}.json`,
              JSON.stringify({ job, plan, validationError }, null, 2) + "\n",
            );
          }
          row.status = classifyCanaryResult(test, job, validationError);
          if (validationError) row.validation_error = validationError;
        } catch (error) {
          row.error = error.message;
        }
        row.duration_ms = Date.now() - started;
        await save();
        console.log(JSON.stringify(row));
        assert.ok(
          pipeline !== 2 ||
            ["complete", "constraint_rejected"].includes(row.status),
          "V2 production gate failed; stop before spending more model calls. Rollout remains blocked.",
        );
        assert.ok(
          ![
            "AI_QUOTA_EXHAUSTED",
            "AI_AUTH_INVALID",
            "AI_PROVIDER_CONFIGURATION_INVALID",
          ].includes(row.error_code),
          "Provider cannot serve further canary requests; stop without spending more calls",
        );
      }
    }
    const v2 = reports.filter((row) => row.pipeline === 2);
    assert.ok(
      v2.length === (mode === "compare" ? 3 : 2) &&
        v2.every((row) =>
          ["complete", "constraint_rejected"].includes(row.status),
        ),
      "V2 production gate failed; see report. Rollout must remain blocked.",
    );
    return reports;
  } finally {
    await save();
  }
}

const total = (calls = [], field) =>
  calls.length && calls.every((call) => Number.isFinite(call[field]))
    ? calls.reduce((sum, call) => sum + call[field], 0)
    : null;
export function summarize(rows) {
  return Object.fromEntries(
    [1, 2].map((pipeline) => {
      const selected = rows.filter((row) => row.pipeline === pipeline);
      return [
        `v${pipeline}`,
        {
          attempted: selected.length,
          complete: selected.filter((row) => row.status === "complete").length,
          constraints: selected.filter(
            (row) => row.status === "constraint_rejected",
          ).length,
          failed: selected.filter(
            (row) => !["complete", "constraint_rejected"].includes(row.status),
          ).length,
          duration_ms: selected.reduce(
            (sum, row) => sum + (row.duration_ms ?? 0),
            0,
          ),
          calls: selected.reduce((sum, row) => sum + (row.calls ?? 0), 0),
        },
      ];
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await runProductionCanary({
    base: process.env.API_BASE_URL,
    commit: process.env.EXPECTED_DEPLOY_COMMIT,
    runId: process.env.PLANNING_CANARY_RUN_ID,
    mode: process.env.PLANNING_CANARY_MODE ?? "compare",
  });
}
