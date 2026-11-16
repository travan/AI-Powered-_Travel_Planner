import "../apps/server/node_modules/reflect-metadata/Reflect.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { GenerationStore } from "../apps/server/src/modules/itinerary/generation/generation.store.ts";
import { acquireAiPermit } from "../apps/server/src/modules/itinerary/generation/ai-permit.ts";
import { PostgresSqlClient } from "../apps/server/src/database/postgres-sql.client.ts";
import * as fixtures from "../tests/unit/fixtures/malaysia-singapore-request.ts";
const { malaysiaSingaporeRequest } =
  (fixtures as unknown as { default?: typeof fixtures }).default ?? fixtures;
import { HttpException } from "../apps/server/node_modules/@nestjs/common/index.js";
const { Pool } = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
)("pg");
const connectionString = process.env.PLANNING_V2_TEST_URL;
assert.ok(connectionString, "PLANNING_V2_TEST_URL is required");
const url = new URL(connectionString);
assert.ok(
  ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
    /test/i.test(url.pathname),
  "Use an isolated local test database",
);
const pool = new Pool({
  connectionString,
  max: 20,
  connectionTimeoutMillis: 5000,
  query_timeout: 10000,
});
const sql = new PostgresSqlClient(pool);
const store = new GenerationStore(pool, sql);
const users = Array.from({ length: 101 }, () => randomUUID());
try {
  await pool.query(
    "insert into users(id,email,password_hash) select id,(id::text||'@v2-test.invalid')::citext,'not-a-login-password' from unnest($1::uuid[]) id",
    [users],
  );
  const durations: number[] = [];
  const submitted = await Promise.all(
    users.slice(0, 100).map(async (user, i) => {
      const start = performance.now();
      const id = await store.admit(
        user,
        malaysiaSingaporeRequest(),
        `burst-${i}`,
      );
      durations.push(performance.now() - start);
      return id;
    }),
  );
  assert.equal(new Set(submitted).size, 100);
  assert.equal(
    (
      await pool.query(
        "select outstanding from planning_admission_capacity where id=1",
      )
    ).rows[0].outstanding,
    100,
  );
  await assert.rejects(
    store.admit(users[100]!, malaysiaSingaporeRequest(), "overflow"),
    (e: unknown) => e instanceof HttpException && e.getStatus() === 429,
  );
  const alias = await store.admit(
    users[0]!,
    malaysiaSingaporeRequest(),
    "alias-key",
  );
  assert.equal(alias, submitted[0]);
  await pool.query("update itinerary_jobs set status='failed' where id=$1", [
    alias,
  ]);
  assert.equal(
    await store.admit(users[0]!, malaysiaSingaporeRequest(), "alias-key"),
    alias,
    "An alias key must replay the original job even after completion/failure",
  );
  await assert.rejects(
    store.admit(
      users[0]!,
      { ...malaysiaSingaporeRequest(), num_days: 9 },
      "alias-key",
    ),
  );
  const generation = (
    await pool.query("select generation_id from itinerary_jobs where id=$1", [
      alias,
    ])
  ).rows[0].generation_id;
  for (const capacity of [1, 2, 4, 8, 16]) {
    process.env.PLANNING_AI_CONCURRENCY = String(capacity);
    const contenders = await Promise.allSettled(
      Array.from({ length: 24 }, () =>
        acquireAiPermit(new PostgresSqlClient(pool)),
      ),
    );
    const granted = contenders.filter(
      (entry): entry is PromiseFulfilledResult<() => Promise<void>> =>
        entry.status === "fulfilled",
    );
    try {
      assert.equal(
        granted.length,
        capacity,
        "Global inference slots must be shared by independent workers",
      );
      for (const entry of contenders)
        if (entry.status === "rejected")
          assert.equal(entry.reason.getStatus(), 503);
    } finally {
      await Promise.all(granted.map((entry) => entry.value()));
    }
  }
  let calls = 0;
  const work = async () => {
    calls++;
    return { items: [{ name: "realistic test result" }] };
  };
  const first = await store.once(generation, work);
  assert.deepEqual(await store.once(generation, work), first);
  assert.equal(
    calls,
    1,
    "Replaying a received response must not call AI again",
  );
  await Promise.all([
    store.resume(users[0]!, alias!),
    store.resume(users[0]!, alias!),
  ]);
  await assert.rejects(store.resume(users[100]!, alias!));
  const resumed = (
    await pool.query(
      "select generation_id,status from itinerary_jobs where id=$1",
      [alias],
    )
  ).rows[0];
  assert.equal(resumed.generation_id, generation);
  assert.equal(resumed.status, "queued");
  assert.deepEqual(await store.once(generation, work), first);
  assert.equal(
    calls,
    1,
    "Retry must preserve the generation and its received response",
  );
  const unknown = (
    await pool.query("select generation_id from itinerary_jobs where id=$1", [
      submitted[1],
    ])
  ).rows[0].generation_id;
  let uncertainCalls = 0;
  const timeout = async () => {
    uncertainCalls++;
    throw new HttpException({ code: "AI_RESULT_UNKNOWN" }, 422);
  };
  await assert.rejects(store.once(unknown, timeout));
  await assert.rejects(store.once(unknown, timeout));
  assert.equal(
    uncertainCalls,
    1,
    "An unknown outcome must never dispatch again",
  );
  const calling = (
    await pool.query("select generation_id from itinerary_jobs where id=$1", [
      submitted[2],
    ])
  ).rows[0].generation_id;
  await pool.query(
    "insert into planning_generation_ai(generation_id,state) values($1,'calling')",
    [calling],
  );
  await assert.rejects(
    store.once(calling, async () => {
      throw Error("Must not run after a crash");
    }),
  );
  const claimed = (
    await pool.query(
      "update itinerary_jobs set status='processing',claim_token=gen_random_uuid() where id=$1 returning generation_id,claim_token",
      [submitted[3]],
    )
  ).rows[0];
  await store.save(claimed.generation_id, submitted[3]!, claimed.claim_token, {
    days: [{ day_number: 1 }],
  });
  await assert.rejects(
    store.save(claimed.generation_id, submitted[3]!, randomUUID(), {
      days: [],
    }),
  );
  assert.equal(
    (await store.checkpoint<{ days: unknown[] }>(claimed.generation_id))!.days
      .length,
    1,
  );
  await pool.query(
    "update itinerary_jobs set status='failed' where user_id=any($1::uuid[]) and status in ('queued','processing')",
    [users],
  );
  for (let i = 0; i < 5; i++)
    await store.admit(
      users[99]!,
      { ...malaysiaSingaporeRequest(), force_refresh: true },
      `per-user-${i}`,
    );
  await assert.rejects(
    store.admit(
      users[99]!,
      { ...malaysiaSingaporeRequest(), force_refresh: true },
      "per-user-overflow",
    ),
    (e: unknown) => e instanceof HttpException && e.getStatus() === 429,
  );
  await assert.rejects(
    store.resume(users[99]!, submitted[99]!),
    (e: unknown) => e instanceof HttpException && e.getStatus() === 429,
  );
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1]!;
  console.log(
    JSON.stringify(
      {
        test: "isolated-postgres-generation-v2",
        accepted: 100,
        uniqueJobs: 100,
        p95AdmissionMs: Math.round(p95),
        singleCallReplay: true,
        unknownNotRedispatched: true,
        checkpointClaimGuard: true,
        retryPreservesGeneration: true,
        retryAdmissionQuota: true,
        globalInferenceCapacities: [1, 2, 4, 8, 16],
        scope:
          "Database admission and durability only; not a real-model or Cloudflare Queue capacity certification.",
      },
      null,
      2,
    ),
  );
  assert.ok(p95 <= 1000, "Admission p95 must be <=1 second");
} finally {
  await pool.query("delete from users where id=any($1::uuid[])", [users]);
  await pool.end();
}
