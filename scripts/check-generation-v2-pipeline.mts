import "../apps/server/node_modules/reflect-metadata/Reflect.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { GenerationStore } from "../apps/server/src/modules/itinerary/generation/generation.store.ts";
import { CatalogFirstPlanner } from "../apps/server/src/modules/itinerary/generation/catalog-first-planner.ts";
import { JourneyService } from "../apps/server/src/modules/itinerary/journey/journey.service.ts";
import { PostgresSqlClient } from "../apps/server/src/database/postgres-sql.client.ts";
import { PostgresCityRepository } from "../apps/server/src/modules/cities/infrastructure/postgres-city.repository.ts";
import { CitiesService } from "../apps/server/src/modules/cities/application/cities.service.ts";
import { PostgresItineraryRepository } from "../apps/server/src/modules/itinerary/infrastructure/postgres-itinerary.repository.ts";
import { workerRequestContext } from "../apps/server/src/cloudflare/request-context.ts";
import * as scenarios from "../tests/unit/fixtures/catalog-scenario.ts";
const { catalogScenario } =
  (scenarios as unknown as { default?: typeof scenarios }).default ?? scenarios;
const { Pool } = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
)("pg");
const connectionString = process.env.PLANNING_V2_TEST_URL;
assert.ok(connectionString, "PLANNING_V2_TEST_URL required");
const url = new URL(connectionString);
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    /test/.test(url.pathname),
  "Isolated local test database only",
);
process.env.AI_PROVIDER = "cloudflare";
process.env.PLANNING_V2_PERCENT = "100";
process.env.PLANNING_AI_CONCURRENCY = "4";
process.env.DOCUMENT_STORE = "postgres";
const pool = new Pool({ connectionString, max: 20 });
const sql = new PostgresSqlClient(pool);
const store = new GenerationStore(pool, sql);
const planner = new CatalogFirstPlanner(
  store,
  new CitiesService(new PostgresCityRepository(sql)),
  new PostgresItineraryRepository(sql),
  sql,
);
const service = new JourneyService(sql, {} as never, pool, store, planner);
const users = Array.from({ length: 101 }, () => randomUUID());
const fixture = catalogScenario();
const suffix = randomUUID().slice(0, 8);
const renamed = new Map(
  fixture.cities.map((c) => [c.slug, `${c.slug}-v2-${suffix}`]),
);
const seeded: string[] = [];
let calls = 0;
const binding = {
  async run(_model: string, payload: Record<string, any>) {
    calls++;
    const context = JSON.parse(payload.messages[1].content.split("\n").at(-1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      response: {
        cities: [],
        items: context.missing.map(
          (n: { key: string; fixed_name?: string; kind: string }) => ({
            key: n.key,
            name: n.fixed_name ?? `Local mock ${n.key}`,
            amount: n.kind === "stay" ? 300000 : 10000,
            duration_minutes: 60,
          }),
        ),
      },
    };
  },
};
try {
  await pool.query(
    "insert into users(id,email,password_hash) select id,(id::text||'@v2-pipeline.invalid')::citext,'test-only' from unnest($1::uuid[]) id",
    [users],
  );
  for (const city of fixture.cities) {
    const slug = renamed.get(city.slug)!;
    await pool.query(
      "insert into cities(slug,name,country,timezone,currency,lat,lon,popular) values($1,$2,$3,$4,$5,$6,$7,false)",
      [
        slug,
        city.name,
        city.country,
        city.timezone,
        city.currency,
        city.lat,
        city.lon,
      ],
    );
    seeded.push(slug);
    for (const place of city.places)
      await pool.query(
        "insert into places(city_slug,canonical_name,current_name,type,category,tags,source,last_verified_at) values($1,$2,$2,$3,$4,$5,'internal_seed',now())",
        [slug, place.name, place.type, place.category, place.tags],
      );
    for (const activity of city.activities) {
      const tags = activity.tags.map((tag) => {
        for (const [from, to] of renamed) tag = tag.replaceAll(from, to);
        return tag;
      });
      await pool.query(
        "insert into activity_catalog(city_slug,title,category,tags,estimated_cost,currency,duration_minutes,source,last_verified_at) values($1,$2,$3,$4,$5,$6,$7,'internal_seed',now())",
        [
          slug,
          activity.title,
          activity.category,
          tags,
          activity.estimated_cost,
          activity.currency,
          activity.duration_minutes,
        ],
      );
    }
  }
  const dto = fixture.dto;
  const run = (id: string) =>
    workerRequestContext.run({ pool, ai: binding, rawAi: binding }, () =>
      service.processNextJob(id),
    );
  const first = await service.enqueue(users[100]!, dto, "db-first");
  await run(first.job_id);
  const firstStatus = await service.getJob(users[100]!, first.job_id);
  assert.equal(firstStatus.status, "complete");
  assert.equal(firstStatus.pipeline_version, 2);
  assert.equal(firstStatus.usage_recorded, true);
  assert.deepEqual(firstStatus.ai_usage, []);
  assert.equal(
    calls,
    0,
    "Real catalog queries with complete prices must avoid inference",
  );
  // Missing meal prices trigger one whole-trip supplement, retaining all DB venue names.
  await pool.query(
    "delete from activity_catalog where city_slug=any($1::text[]) and category='restaurant'",
    [seeded],
  );
  const start = performance.now();
  const admission: number[] = [];
  const jobs = await Promise.all(
    users.slice(0, 100).map(async (user, i) => {
      const t = performance.now();
      const job = await service.enqueue(user, dto, `burst-${i}`);
      admission.push(performance.now() - t);
      return job.job_id;
    }),
  );
  const terminal: number[] = [];
  const reads: number[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= jobs.length) return;
        const id = jobs[index]!;
        // Duplicate delivery competes for the same durable claim.
        await Promise.all([run(id), run(id)]);
        const t = performance.now();
        const status = await service.getJob(users[index]!, id);
        reads.push(performance.now() - t);
        assert.equal(status.status, "complete", JSON.stringify(status));
        terminal.push(performance.now() - start);
        await run(id);
      }
    }),
  );
  assert.equal(calls, 100);
  const stored = (
    await pool.query(
      "select id,countries,result from itineraries where user_id=any($1::text[])",
      [users],
    )
  ).rows;
  assert.equal(stored.length, 101);
  for (const plan of stored) {
    assert.deepEqual([...plan.countries].sort(), ["MY", "SG"]);
    assert.equal(plan.result.days.length, 10);
    assert.equal(plan.result.budget_breakdown.complete, true);
    assert.ok(plan.result.total_cost <= 20000000);
  }
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as count from city_catalog_ingestion_jobs where itinerary_id=any($1::uuid[])",
        [stored.map((p) => p.id)],
      )
    ).rows[0].count,
    0,
    "Suggestions must not enter shared catalog",
  );
  const p95 = (values: number[]) =>
    Math.round(
      values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!,
    );
  // An expired historical failure with a durable response is replayed once,
  // under the original owner's job, without another inference or duplicate plan.
  const recoveryJob = jobs[0]!;
  const original = (await pool.query("select itinerary_id from itinerary_jobs where id=$1", [recoveryJob])).rows[0].itinerary_id;
  await pool.query("update itinerary_jobs set status='failed',itinerary_id=null,error_code='AI_RESPONSE_INVALID',deadline_at=now()-interval '1 day' where id=$1", [recoveryJob]);
  await pool.query("delete from itineraries where id=$1", [original]);
  assert.deepEqual(await store.recoverReceived(users[1]!, [recoveryJob]), []);
  const recovered = await Promise.all([store.recoverReceived(users[0]!, [recoveryJob]), store.recoverReceived(users[0]!, [recoveryJob])]);
  assert.equal(recovered.flat().length, 1);
  await run(recoveryJob);
  const repaired = await service.getJob(users[0]!, recoveryJob);
  assert.equal(repaired.status, "complete");
  assert.equal(calls, 100, "Recovery must never call AI again");
  const result = (await pool.query("select result from itineraries where id=$1", [repaired.itinerary_id])).rows[0].result;
  assert.equal(result.days.length, 10);
  assert.ok(result.issues.some((issue: { code: string }) => issue.code === "SAVED_AI_RESPONSE_RECOVERED"));
  await pool.query("update itinerary_jobs set status='failed' where id=$1", [recoveryJob]);
  const linked = await service.getJob(users[0]!, recoveryJob);
  assert.equal(linked.status, "complete", "A saved result must override a stale failed status");
  assert.equal((await pool.query("select count(*)::int as count from itineraries where user_id=$1", [users[0]])).rows[0].count, 1);
  console.log(
    JSON.stringify(
      {
        scope:
          "Local PostgreSQL, real services/catalog queries, mock inference and simulated deliveries; not Cloudflare/real-model capacity certification",
        accepted: 100,
        complete: 100,
        daysPerPlan: 10,
        mockCalls: 100,
        completeCatalogCalls: 0,
        p95AdmissionMs: p95(admission),
        p95OwnerStatusReadMs: p95(reads),
        p95TerminalMs: p95(terminal),
        duplicateItineraries: 0,
        historicalResponseRecovery: true,
        staleStatusRepair: true,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.query("delete from itineraries where user_id=any($1::text[])", [
    users,
  ]);
  await pool.query("delete from users where id=any($1::uuid[])", [users]);
  await pool.query(
    "delete from activity_catalog where city_slug=any($1::text[])",
    [seeded],
  );
  await pool.query("delete from places where city_slug=any($1::text[])", [
    seeded,
  ]);
  await pool.query("delete from cities where slug=any($1::text[])", [seeded]);
  await pool.end();
}
