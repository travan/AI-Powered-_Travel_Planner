import "../apps/server/node_modules/reflect-metadata/Reflect.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { GenerationStore } from "../apps/server/src/modules/itinerary/generation/generation.store.ts";
import { CatalogFirstPlanner } from "../apps/server/src/modules/itinerary/generation/catalog-first-planner.ts";
import { PostgresSqlClient } from "../apps/server/src/database/postgres-sql.client.ts";
import { PostgresCityRepository } from "../apps/server/src/modules/cities/infrastructure/postgres-city.repository.ts";
import { CitiesService } from "../apps/server/src/modules/cities/application/cities.service.ts";
import { PlaceLookupService } from "../apps/server/src/modules/cities/application/place-lookup.service.ts";
import { PostgresItineraryRepository } from "../apps/server/src/modules/itinerary/infrastructure/postgres-itinerary.repository.ts";
import { workerRequestContext } from "../apps/server/src/cloudflare/request-context.ts";
// @ts-ignore: shared Node canary fixture loader
import { planningCanaryCases } from "./planning-canary-cases.mjs";
import * as fixtures from "../tests/unit/fixtures/malaysia-singapore-request.ts";
const { malaysiaSingaporeRequest } =
  (fixtures as unknown as { default?: typeof fixtures }).default ?? fixtures;
const { Pool } = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
)("pg");
const connectionString = process.env.PLANNING_V2_TEST_URL;
assert.ok(
  connectionString && process.env.PLANNING_LIVE_MODEL === "true",
  "Explicit live-model opt-in and local DB required",
);
const url = new URL(connectionString);
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    /test/.test(url.pathname),
  "Local isolated test database only",
);
if ((process.env.AI_PROVIDER ?? "cloudflare") === "cloudflare")
  assert.ok(
    process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN,
    "Cloudflare credentials required",
  );
const pool = new Pool({ connectionString, max: 4 });
const sql = new PostgresSqlClient(pool);
const store = new GenerationStore(pool, sql);
const planner = new CatalogFirstPlanner(
  store,
  new CitiesService(
    new PostgresCityRepository(sql),
    new PlaceLookupService(sql),
  ),
  new PostgresItineraryRepository(sql),
  sql,
);
const user = randomUUID();
let calls = 0;
let upstream: { status: number; codes: unknown[] } | undefined;
const started = Date.now();
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (
    [
      "api.anthropic.com",
      "api.openai.com",
      "generativelanguage.googleapis.com",
    ].includes(url.hostname)
  ) {
    calls++;
    assert.ok(calls <= 1, "A generation must not dispatch twice");
  }
  return realFetch(input, init);
};
const binding = {
  async run(model: string, input: Record<string, unknown>) {
    calls++;
    assert.ok(calls <= 1, "A generation must not dispatch twice");
    const result = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(120000),
      },
    );
    const body = (await result.json()) as {
      success?: boolean;
      result?: unknown;
      errors?: { code?: string | number; message?: string }[];
    };
    if (!result.ok || body.success === false) {
      upstream = {
        status: result.status,
        codes: (body.errors ?? []).map((error) => error.code),
      };
      throw Object.assign(new Error(body.errors?.[0]?.message ?? "Workers AI request failed"), {
        status: result.status,
        code: body.errors?.[0]?.code,
      });
    }
    return body.result;
  },
};
try {
  await pool.query(
    "insert into users(id,email,password_hash) values($1,$2,'test-only')",
    [user, `${user}@v2-live-test.invalid`],
  );
  const testCase = (await planningCanaryCases()).find(
    (item: { id: string }) =>
      item.id === (process.env.PLANNING_LIVE_CASE ?? "original-my-sg"),
  );
  assert.ok(testCase, "Unknown live test case");
  const dto = testCase.request as ReturnType<typeof malaysiaSingaporeRequest>;
  const id = await store.admit(user, dto, "live-once");
  const job = (
    await pool.query(
      "update itinerary_jobs set status='processing',claim_token=gen_random_uuid() where id=$1 returning id,generation_id,claim_token",
      [id],
    )
  ).rows[0];
  let outcome: { status: string; [key: string]: unknown };
  try {
    const result = await workerRequestContext.run(
      { pool, ai: binding, rawAi: binding },
      () => planner.generate({ userId: user, dto, job }),
    );
    outcome = {
      status: "complete",
      days: result.result.days.length,
      total: result.result.total_cost,
      issues: result.result.issues,
    };
    assert.equal(result.result.days.length, dto.num_days);
    assert.ok(Number.isFinite(result.result.total_cost) && result.result.total_cost > 0);
    if (result.result.total_cost > dto.budget!)
      assert.ok(result.result.issues?.some((issue) => issue.code === "OVER_BUDGET" &&
        issue.severity === "warning" && issue.params?.currency === result.result.currency &&
        issue.params?.amount === result.result.total_cost - dto.budget!));
  } catch (error) {
    outcome = {
      status: "failed",
      error: (error as { getResponse?: () => unknown }).getResponse?.() ?? {
        code: (error as { code?: string }).code,
        message: (error as Error).message,
      },
    };
  }
  const ledger = (
    await pool.query(
      "select state,response,error_code,usage from planning_generation_ai where generation_id=$1",
      [job.generation_id],
    )
  ).rows[0];
  const checkpoint = await store.checkpoint(job.generation_id);
  const report = {
    scope:
      "Real Workers AI and resolver, local PostgreSQL; not a Cloudflare Queue load certification",
    testCase: testCase.id,
    provider: process.env.AI_PROVIDER ?? "cloudflare",
    upstream,
    calls,
    durationMs: Date.now() - started,
    outcome,
  };
  await mkdir("test-results/generation-v2-live", { recursive: true });
  await writeFile(
    `test-results/generation-v2-live/${testCase.id}.json`,
    JSON.stringify({ report, ledger, checkpoint }, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  assert.ok(calls <= 1);
  const controlledConstraint =
    testCase.allowConstraintFailure &&
    outcome.status === "failed" &&
    (outcome.error as { code?: string; params?: { reason?: string } })?.code ===
      "PLANNING_BUDGET_UNSATISFIABLE" &&
    typeof (outcome.error as { params?: { reason?: string } }).params
      ?.reason === "string";
  assert.ok(
    outcome.status === "complete" || controlledConstraint,
    "Live generation failed; see the saved report (constraint rejection is not generation success)",
  );
} finally {
  await pool.query("delete from itineraries where user_id=$1", [user]);
  await pool.query("delete from users where id=$1", [user]);
  await pool.end();
  globalThis.fetch = realFetch;
}
