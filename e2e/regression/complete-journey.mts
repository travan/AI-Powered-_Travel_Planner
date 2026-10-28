import "../../apps/server/node_modules/reflect-metadata/Reflect.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "../../apps/server/node_modules/pg/lib/index.js";
import { buildApp } from "../../apps/server/dist/app.js";
import { JourneyService } from "../../apps/server/dist/modules/itinerary/journey/journey.service.js";
import * as travelTypes from "../../packages/types/src/index.ts";
const { createPlanningCriteria } = (travelTypes as any).default ?? travelTypes;

// Explicit test database only. Never fall back to the app's normal connection.
const url = process.env.JOURNEY_TEST_DATABASE_URL;
if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
  throw new Error(
    "Set JOURNEY_TEST_DATABASE_URL to an isolated localhost database.",
  );
Object.assign(process.env, {
  POSTGRES_URL: url,
  DATABASE_PROVIDER: "postgres",
  DOCUMENT_STORE: "postgres",
  JWT_SECRET: "journey-integration-only-secret-32-characters",
  TEST_ENABLE_MOCK_TOKENS: "true",
  AI_PROVIDER: "mock",
  NODE_ENV: "test",
  RATE_LIMIT_MAX: "10000",
});
const pool = new pg.Pool({ connectionString: url });
const host = randomUUID(),
  viewer = randomUUID(),
  outsider = randomUUID();
const app = await buildApp();
app.useLogger(["error", "warn"]);
await app.listen(0, "127.0.0.1");
const base = await app.getUrl();
const journey = app.get(JourneyService);
async function request(
  path: string,
  user = host,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  expected = 200,
) {
  const response = await fetch(`${base}/api/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer mock-access-${user}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: ${JSON.stringify(result)}`,
  );
  return result;
}
async function finish(id: string) {
  await journey.processNextJob();
  return request(`itinerary/jobs/${id}`);
}
let tripIds: string[] = [];
try {
  for (const [id, name] of [
    [host, "Host"],
    [viewer, "Viewer"],
    [outsider, "Outsider"],
  ])
    await pool.query(
      "insert into users(id,email,password_hash) values($1,$2,$3)",
      [id, `${id}@journey.test`, "test-only"],
    );
  const invalid = createPlanningCriteria();
  const bad = await request(
    "planning/validate",
    host,
    {
      cities: ["da-nang"],
      num_days: 3,
      currency: "VND",
      trip_style: "mixed",
      num_travelers: 2,
      planning: invalid,
    },
    "POST",
    201,
  );
  assert.equal(bad.valid, false);
  const resolve = await request(
    "locations/resolve",
    host,
    { latitude: 16.05, longitude: 108.2 },
    "POST",
    201,
  );
  assert.ok(Array.isArray(resolve.candidates));
  const scenarios = [
    { name: "Flight return", cities: ["da-nang"], days: 3, mode: "flight" },
    {
      name: "Multi-city car",
      cities: ["da-nang", "hue"],
      days: 4,
      mode: "car",
    },
    { name: "Day trip dietary", cities: ["ha-noi"], days: 1, mode: "car" },
  ];
  for (const scenario of scenarios) {
    const planning = createPlanningCriteria();
    planning.journey.origin = { label: "Hà Nội", source: "manual" };
    planning.journey.destinations = scenario.cities;
    planning.transport_preferences.mode = scenario.mode;
    planning.budget.total = 10000000;
    if (scenario.days === 1) {
      planning.stay_preferences.type = "none";
      planning.dining_preferences.requirements = [
        { value: "Ăn chay", priority: "required" },
      ];
      planning.dining_preferences.allergies = ["Đậu phộng"];
    }
    if (scenario.mode === "flight") {
      planning.transport_preferences.confirmed = true;
      planning.transport_preferences.provider = "Test provider";
      planning.transport_preferences.booking_reference = "DEMO-ONLY";
      planning.transport_preferences.arrival_at = "2026-11-01T10:00";
      planning.transport_preferences.departure_at = "2026-11-03T15:00";
    }
    const dto = {
      cities: scenario.cities,
      city_names: scenario.cities,
      num_days: scenario.days,
      ...(scenario.days > 1
        ? { start_date: "2026-11-01", end_date: `2026-11-0${scenario.days}` }
        : {}),
      currency: "VND",
      trip_style: "mixed",
      num_travelers: 2,
      locale: "vi",
      planning,
    };
    const queued = await request("itinerary/generate", host, dto, "POST", 201);
    assert.equal(queued.status, "queued");
    const finished = await finish(queued.job_id);
    assert.equal(finished.status, "complete");
    await request(
      `itinerary/jobs/${queued.job_id}`,
      outsider,
      undefined,
      "GET",
      404,
    );
    const result = await request(`itinerary/${finished.itinerary_id}`);
    const itinerary = result.itineraries[0];
    assert.equal(itinerary.schema_version, 2);
    assert.equal(itinerary.days.length, scenario.days);
    assert.ok(itinerary.transport_summary.some((s: any) => s.to === "Hà Nội"));
    assert.ok(
      itinerary.days.some((d: any) =>
        d.activities.some((a: any) => a.kind === "meal"),
      ),
    );
    if (scenario.days === 1)
      assert.equal(itinerary.budget_breakdown.accommodation, 0);
    const saved = await request(
      `itinerary/${finished.itinerary_id}/save`,
      host,
      {},
      "POST",
      201,
    );
    tripIds.push(saved.trip_id);
    if (scenario.mode === "flight") {
      const english = await request(
        "itinerary/generate",
        host,
        { ...dto, locale: "en" },
        "POST",
        201,
      );
      const englishJob = await finish(english.job_id);
      assert.equal(englishJob.status, "complete");
      assert.notEqual(englishJob.itinerary_id, finished.itinerary_id);
      const englishPlan = (
        await request(`itinerary/${englishJob.itinerary_id}`)
      ).itineraries[0];
      assert.equal(englishPlan.locale, "en");
      assert.ok(englishPlan.overview.startsWith("Demo itinerary"));
      assert.equal(itinerary.locale, "vi");
      const cachedEnglish = await request(
        "itinerary/generate",
        host,
        { ...dto, locale: "en" },
        "POST",
        201,
      );
      assert.equal(
        (await finish(cachedEnglish.job_id)).itinerary_id,
        englishJob.itinerary_id,
      );
    }

    if (scenario.mode === "flight") {
      const tickets = await request(
        `trips/${saved.trip_id}/transport-bookings`,
      );
      assert.equal(tickets.length, 2);
      assert.ok(
        tickets.every((ticket: any) => ticket.bookingStatus === "ticketed"),
      );
    }
    const reopened = await request(`trips/${saved.trip_id}/planning`);
    assert.equal(reopened.days.length, scenario.days);
    console.log(`PASS ${scenario.name}: generate → save → reopen`);
  }
  const tripId = tripIds[0]!;
  await pool.query(
    "insert into trip_members(trip_id,user_id,role,status) values($1,$2,'viewer','active')",
    [tripId, viewer],
  );
  await request(
    `trips/${tripId}/accommodations`,
    outsider,
    undefined,
    "GET",
    404,
  );
  const stay = {
    name: "User selected stay",
    city: "da-nang",
    rooms: 2,
    guests: 2,
    check_in_date: "2026-11-01",
    check_out_date: "2026-11-03",
    price_per_night: 500000,
    currency: "VND",
    booking_status: "selected",
    locked: false,
  };
  await request(`trips/${tripId}/accommodations`, viewer, stay, "POST", 403);
  const stays = await request(
    `trips/${tripId}/accommodations`,
    host,
    stay,
    "POST",
    201,
  );
  assert.equal(stays[0].total_price, 2000000);
  assert.equal(stays[0].booking_status, "selected");
  await request(
    `trips/${tripId}/accommodations/${stays[0].id}`,
    host,
    { ...stay, version: 999 },
    "PATCH",
    409,
  );
  await request(
    `trips/${tripId}/accommodations/${stays[0].id}`,
    host,
    { ...stay, booking_status: "booked", version: 1 },
    "PATCH",
    400,
  );
  let plan = await request(`trips/${tripId}/planning`);
  const manual = await request(
    `trips/${tripId}/activities`,
    host,
    {
      title: "Manual tea",
      category: "cafe",
      scheduled_at: "2026-11-01T13:00:00+07:00",
      currency: "VND",
    },
    "POST",
    201,
  );
  const kept = await request(
    `trips/${tripId}/activities`,
    host,
    {
      title: "Locked stop",
      category: "rest",
      scheduled_at: "2026-11-01T20:00:00+07:00",
      currency: "VND",
    },
    "POST",
    201,
  );
  plan = await request(`trips/${tripId}/planning`);
  plan = await request(
    `trips/${tripId}/planning`,
    host,
    { expected_version: plan.version, locked_ids: [kept.id] },
    "PATCH",
  );
  const target = plan.days[0].id;
  const revisionJob = await request(
    `trips/${tripId}/itinerary-revisions`,
    host,
    {
      scope: "day",
      target_id: target,
      expected_version: plan.version,
      instruction: "Đi thư thả hơn",
    },
    "POST",
    201,
  );
  const done = await finish(revisionJob.job_id);
  assert.equal(done.status, "complete");
  const previews = await request(`trips/${tripId}/itinerary-revisions`);
  assert.equal(previews[0].status, "preview");
  assert.equal(previews[0].candidate.days[0].date.slice(0, 10), "2026-11-01");
  assert.ok(previews[0].candidate.days[0].activities.length > 0);
  await request(
    `trips/${tripId}/itinerary-revisions/${done.revision_id}/apply`,
    viewer,
    { expected_version: plan.version },
    "POST",
    403,
  );
  plan = await request(
    `trips/${tripId}/itinerary-revisions/${done.revision_id}/apply`,
    host,
    { expected_version: plan.version },
    "POST",
    201,
  );
  assert.ok(
    plan.days.some((d: any) => d.activities.some((a: any) => a.id === kept.id)),
  );
  assert.ok(
    !plan.days.some((d: any) =>
      d.activities.some((a: any) => a.id === manual.id),
    ),
  );
  await request(
    `trips/${tripId}/itinerary-revisions/${done.revision_id}/apply`,
    host,
    { expected_version: previews[0].base_version },
    "POST",
    409,
  );
  const restoreJob = await request(
    `trips/${tripId}/itinerary-revisions`,
    host,
    {
      scope: "restore",
      restore_revision_id: done.revision_id,
      expected_version: plan.version,
    },
    "POST",
    201,
  );
  const restored = await finish(restoreJob.job_id);
  assert.equal(restored.status, "complete");
  plan = await request(
    `trips/${tripId}/itinerary-revisions/${restored.revision_id}/apply`,
    host,
    { expected_version: plan.version },
    "POST",
    201,
  );
  const schedule = await request(`trips/${tripId}/activities`);
  assert.equal(
    schedule.filter(
      (a: any) => a.title === "Manual tea" && a.status !== "cancelled",
    ).length,
    1,
  );
  assert.ok(
    plan.days.some((d: any) => d.activities.some((a: any) => a.id === kept.id)),
  );
  const todos = await request(`trips/${tripId}/planning-checklist`);
  assert.ok(todos.every((t: any) => t.status === "todo"));
  console.log(
    "PASS accommodations: room totals, manual confirmation, permissions and optimistic versioning",
  );
  console.log("PASS revisions: preview, host-only apply, conflict and restore");
  // Contract fixture only: real provider language quality is tested separately.
  const aiModule = await import("../../packages/ai/src/index.ts");
  const { MockAIProvider } = (aiModule as any).default ?? aiModule;
  let translationCalls = 0;
  let failOnce = false;
  const previousTranslate = MockAIProvider.prototype.translateTexts;
  MockAIProvider.prototype.translateTexts = async (
    texts: Record<string, string>,
    target: string,
  ) => {
    translationCalls++;
    if (failOnce) {
      failOnce = false;
      throw new Error("Test transient provider failure");
    }
    return Object.fromEntries(
      Object.entries(texts).map(([key, value]) => [
        key,
        `${target === "en" ? "Translated description" : "Mô tả đã dịch"} ${(value.match(/__KEEP_\d+__/g) ?? []).join(" ")}`,
      ]),
    );
  };
  try {
    const sourceBefore = await request(`trips/${tripId}/planning`);
    assert.equal(sourceBefore.locale, "vi");
    const endpoint = `trips/${tripId}/planning/translations`;
    const list = await request(endpoint);
    assert.equal(list.translations.length, 0);
    await request(endpoint, outsider, undefined, "GET", 404);
    await request(
      endpoint,
      host,
      { target_locale: "fr", source_version: list.source_version },
      "POST",
      400,
    );
    const body = { target_locale: "en", source_version: list.source_version };
    const queued = await request(endpoint, host, body, "POST", 201);
    const deduplicated = await request(endpoint, host, body, "POST", 201);
    assert.equal(deduplicated.job_id, queued.job_id);
    assert.equal((await finish(queued.job_id)).status, "complete");
    const translated = await request(`${endpoint}/en`);
    assert.equal(translated.translations[0].stale, false);
    assert.ok(
      translated.translations[0].texts.overview.startsWith(
        "Translated description",
      ),
    );
    assert.deepEqual(await request(`trips/${tripId}/planning`), sourceBefore);
    const count = translationCalls;
    assert.equal(
      (await request(endpoint, host, body, "POST", 201)).status,
      "cached",
    );
    assert.equal(translationCalls, count);
    // Revoking membership blocks both cached reads and a queued job owned by that member.
    const viewerList = await request(endpoint, viewer);
    const viewerQueued = await request(
      endpoint,
      viewer,
      { target_locale: "vi", source_version: viewerList.source_version },
      "POST",
      400,
    );
    assert.equal(viewerQueued.code, "TRANSLATION_SAME_LANGUAGE");
    await pool.query(
      "update trip_members set status='removed' where trip_id=$1 and user_id=$2",
      [tripId, viewer],
    );
    await request(`${endpoint}/en`, viewer, undefined, "GET", 404);
    await pool.query(
      "update trip_members set status='active' where trip_id=$1 and user_id=$2",
      [tripId, viewer],
    );
    await pool.query(
      "update trips set planning_version=planning_version+1 where id=$1",
      [tripId],
    );
    const viewerFresh = await request(endpoint, viewer);
    const viewerJob = await request(
      endpoint,
      viewer,
      { target_locale: "en", source_version: viewerFresh.source_version },
      "POST",
      201,
    );
    await pool.query(
      "update trip_members set status='removed' where trip_id=$1 and user_id=$2",
      [tripId, viewer],
    );
    await journey.processNextJob();
    await request(
      `itinerary/jobs/${viewerJob.job_id}`,
      viewer,
      undefined,
      "GET",
      404,
    );
    assert.equal(
      (
        await pool.query("select status from itinerary_jobs where id=$1", [
          viewerJob.job_id,
        ])
      ).rows[0].status,
      "failed",
    );
    await pool.query(
      "update trip_members set status='active' where trip_id=$1 and user_id=$2",
      [tripId, viewer],
    );
    // A version change invalidates the translation and rejects an in-flight request.
    await pool.query(
      "update trips set planning_version=planning_version+1 where id=$1",
      [tripId],
    );
    const changed = await request(endpoint);
    assert.equal(changed.translations[0].stale, true);
    await request(endpoint, host, body, "POST", 409);
    const pending = await request(
      endpoint,
      host,
      { target_locale: "en", source_version: changed.source_version },
      "POST",
      201,
    );
    await pool.query(
      "update trips set planning_version=planning_version+1 where id=$1",
      [tripId],
    );
    const failed = await finish(pending.job_id);
    assert.equal(failed.status, "failed");
    assert.equal(failed.error_code, "TRANSLATION_SOURCE_CHANGED");
    // Retry provider failures through the existing lease/attempt mechanism.
    const fresh = await request(endpoint);
    const retry = await request(
      endpoint,
      host,
      { target_locale: "en", source_version: fresh.source_version },
      "POST",
      201,
    );
    failOnce = true;
    assert.equal((await finish(retry.job_id)).status, "queued");
    await pool.query(
      "update itinerary_jobs set available_at=now() where id=$1",
      [retry.job_id],
    );
    assert.equal((await finish(retry.job_id)).status, "complete");
    // Both itinerary and trip translation routes re-check the original permissions.
    const original = await pool.query(
      "select source_itinerary_id::text as id from trips where id=$1",
      [tripId],
    );
    const originalEndpoint = `itinerary/${original.rows[0].id}/translations`;
    const originalList = await request(originalEndpoint);
    await request(originalEndpoint, outsider, undefined, "GET", 404);
    const originalQueued = await request(
      originalEndpoint,
      host,
      { target_locale: "en", source_version: originalList.source_version },
      "POST",
      201,
    );
    assert.equal((await finish(originalQueued.job_id)).status, "complete");
    assert.equal(
      (await request(`${originalEndpoint}/en`)).translations[0].stale,
      false,
    );
    console.log(
      "PASS translations: scoped keys, source unchanged, deduplication, cache, stale versions, retry and permissions",
    );
  } finally {
    if (previousTranslate)
      MockAIProvider.prototype.translateTexts = previousTranslate;
    else delete MockAIProvider.prototype.translateTexts;
  }

  assert.equal(
    (
      await pool.query(
        "select relrowsecurity from pg_class where oid='public.itinerary_translations'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  const browserGrants = await pool.query(
    `select count(*)::int as count from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a left join pg_roles r on r.oid=a.grantee where c.oid='public.itinerary_translations'::regclass and (a.grantee=0 or r.rolname in ('anon','authenticated'))`,
  );
  assert.equal(browserGrants.rows[0].count, 0);
  const retry = await pool.query(
    "insert into itinerary_jobs(user_id,payload,status,attempts,locked_until) values($1,'{}','processing',3,now()-interval '1 minute') returning id",
    [host],
  );
  await journey.processNextJob();
  assert.equal(
    (await request(`itinerary/jobs/${retry.rows[0].id}`)).status,
    "failed",
  );
  console.log("PASS crashed jobs reach a terminal state");
} finally {
  await app.close();
  await pool.query("delete from trips where id=any($1::uuid[])", [tripIds]);
  await pool.query("delete from users where id=any($1::uuid[])", [
    [host, viewer, outsider],
  ]);
  await pool.end();
}
