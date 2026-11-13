import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { createPlanningCriteria } from "../../packages/types/src/journey";

const { Client } = createRequire(`${process.cwd()}/apps/server/package.json`)(
  "pg",
);
const web = "http://127.0.0.1:3352";
const sentinel = "security-ci-server-only-sentinel-0123456789";

async function signUp(request: APIRequestContext, base = "") {
  const response = await request.post(`${base}/api/auth/register`, {
    headers: base ? { "X-Auth-Client": "web" } : {},
    data: {
      email: `product-${randomUUID()}@test.invalid`,
      password: "Test-password-9x!",
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const { user, session } = await response.json();
  return {
    id: user.id as string,
    headers: { Authorization: `Bearer ${session.access_token}` },
  };
}

async function tokyoPlanningFixture(db: InstanceType<typeof Client>) {
  await db.query(
    `insert into cities(slug,name,country,timezone,currency,lat,lon,popular)
     values('tokyo','{"en":"Tokyo","vi":"Tokyo"}','JP','Asia/Tokyo','JPY',35.68,139.69,false)
     on conflict(slug) do nothing`,
  );
  const planning = createPlanningCriteria();
  planning.journey.origin = { label: "Tokyo", source: "manual" };
  planning.journey.destinations = ["tokyo"];
  return {
    cities: ["tokyo"],
    num_days: 1,
    currency: "USD",
    trip_style: "mixed",
    num_travelers: 2,
    planning,
  };
}

test("job admissions are idempotent and notifications remain private", async ({
  request,
}) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const owner = await signUp(request);
  const other = await signUp(request);
  try {
    const data = await tokyoPlanningFixture(db);
    const headers = { ...owner.headers, "Idempotency-Key": randomUUID() };
    const submit = () =>
      request.post("/api/itinerary/generate", { headers, data });
    const responses = await Promise.all([submit(), submit()]);
    const results = [];
    for (const response of responses) {
      expect(response.ok(), await response.text()).toBeTruthy();
      results.push(await response.json());
    }
    const id = results[0].job_id;
    expect(results[1].job_id).toBe(id);
    const notifications = await request.get("/api/notifications", {
      headers: owner.headers,
    });
    expect(notifications.headers()["cache-control"]).toBe("private, no-store");
    const { items } = await notifications.json();
    const queued = items.filter(
      (item: { subject_id: string; event: string }) =>
        item.subject_id === id && item.event === "queued",
    );
    expect(queued).toHaveLength(1);
    expect((await request.get("/api/notifications")).status()).toBe(401);
    const isolated = await request.get("/api/notifications", {
      headers: other.headers,
    });
    expect(await isolated.json()).toEqual({ items: [], next: null });
    expect(
      (
        await request.get(`/api/itinerary/jobs/${id}`, {
          headers: other.headers,
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.patch(`/api/notifications/${queued[0].id}/read`, {
          headers: other.headers,
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.patch(`/api/notifications/${queued[0].id}/read`, {
          headers: owner.headers,
        })
      ).ok(),
    ).toBeTruthy();
    await expect.poll(async () => {
      const response = await request.get(`/api/itinerary/jobs/${id}`, {
        headers: owner.headers,
      });
      const status = await response.json();
      expect(status).not.toHaveProperty("payload");
      return status;
    }, { timeout: 25_000 }).toMatchObject({
      status: "complete",
      itinerary_id: expect.any(String),
    });
  } finally {
    await db.query("delete from itineraries where user_id=$1", [owner.id]);
    await db.query("delete from users where id=any($1::uuid[])", [
      [owner.id, other.id],
    ]);
    await db.end();
  }
});

test("the worker honors Retry-After and exposes the provider failure after three attempts", async ({
  request,
}) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const owner = await signUp(request);
  const scenario = (mode: string) =>
    request.post("http://127.0.0.1:3349/scenario", { data: { mode } });
  try {
    const data = await tokyoPlanningFixture(db);
    expect((await scenario("temporarily-unavailable")).ok()).toBeTruthy();
    const response = await request.post("/api/itinerary/generate", {
      headers: owner.headers,
      data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const { job_id: id } = await response.json();
    const status = async () => {
      const result = await request.get(`/api/itinerary/jobs/${id}`, {
        headers: owner.headers,
      });
      expect(result.ok()).toBeTruthy();
      return result.json();
    };
    for (const attempts of [1, 2]) {
      await expect.poll(status).toMatchObject({ stage: "retry", attempts });
      const { rows: [retry] } = await db.query(
        "select extract(epoch from available_at-now()) as seconds from itinerary_jobs where id=$1",
        [id],
      );
      expect(Number(retry.seconds)).toBeGreaterThan(35);
      // Advance the isolated fixture rather than waiting 45 seconds per retry.
      await db.query("update itinerary_jobs set available_at=now() where id=$1", [id]);
    }
    await expect.poll(status).toMatchObject({
      status: "failed", attempts: 3, error_code: "AI_UNAVAILABLE",
    });
  } finally {
    await scenario("success");
    await db.query("delete from itineraries where user_id=$1", [owner.id]);
    await db.query("delete from users where id=$1", [owner.id]);
    await db.end();
  }
});

test("the production web build shows notifications and keeps server data private", async ({
  page,
}) => {
  test.skip(process.env.E2E_SECURITY_WEB !== "true");
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const owner = await signUp(page.request, web);
  try {
    await db.query(
      "insert into itinerary_jobs(user_id,status,stage,payload,error) values($1,'failed','failed',$2,$3)",
      [
        owner.id,
        { dto: { cities: [], num_days: 1 }, marker: sentinel },
        sentinel,
      ],
    );
    const browserPayloads: Promise<string>[] = [];
    page.on("response", (response) => {
      if (
        /\?_rsc=|\/api\/notifications|\/api\/planning\/requests/.test(
          response.url(),
        )
      )
        browserPayloads.push(response.text().catch(() => ""));
    });
    await page.goto(`${web}/plan`);
    const bell = page.getByRole("button", { name: /Notifications|Thông báo/ });
    await expect(bell).toContainText("1");
    await bell.click();
    const status = page.getByText(
      /Trip planning · Failed|Tạo lịch trình · Thất bại/,
    );
    await expect(status).toBeVisible();
    await status.click();
    await page.getByRole("region", { name: /Notifications|Thông báo/ })
      .getByRole("link", { name: /Failed|Thất bại/ })
      .hover();
    await expect(bell).not.toContainText("1");
    const flight = await page.request.get(`${web}/plan?_rsc=security-check`, {
      headers: { RSC: "1" },
    });
    expect(flight.headers()["content-type"]).toContain("text/x-component");
    expect(await flight.text()).not.toContain(sentinel);
    expect(await page.content()).not.toContain(sentinel);
    for (const payload of await Promise.all(browserPayloads))
      expect(payload).not.toContain(sentinel);

    const {
      rows: [trip],
    } = await db.query(
      "insert into trips(owner_user_id,title) values($1,'Workspace budget fixture') returning id",
      [owner.id],
    );
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'host')",
      [trip.id, owner.id],
    );
    const businessRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (
        path.startsWith("/api/") &&
        !/^\/api\/(auth|notifications)\//.test(path)
      )
        businessRequests.push(path);
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${web}/trips/${trip.id}/workspace`);
    await expect(page.getByTestId("web-role-guide")).toBeVisible();
    expect(businessRequests).toEqual([`/api/trips/${trip.id}/workspace`]);
    await expect(bell).toBeVisible();
  } finally {
    await db.query("delete from users where id=$1", [owner.id]);
    await db.end();
  }
});

test("retry events are durable and private trip events disappear after membership changes", async ({
  request,
}) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const owner = await signUp(request);
  const guest = await signUp(request);
  const inbox = async (headers: typeof owner.headers) =>
    (await request.get("/api/notifications", { headers })).json();
  try {
    const {
      rows: [job],
    } = await db.query(
      "insert into itinerary_jobs(user_id,payload,available_at) values($1,'{}',now()+interval '1 day') returning id",
      [owner.id],
    );
    await db.query(
      "update itinerary_jobs set status='processing',attempts=1,locked_until=now()+interval '1 day' where id=$1",
      [job.id],
    );
    await db.query(
      "update itinerary_jobs set status='queued',stage='retry' where id=$1",
      [job.id],
    );
    await db.query(
      "update itinerary_jobs set status='queued',stage='retry' where id=$1",
      [job.id],
    );
    await db.query(
      "update itinerary_jobs set status='processing',attempts=2 where id=$1",
      [job.id],
    );
    await db.query(
      "update itinerary_jobs set status='failed',stage='failed' where id=$1",
      [job.id],
    );
    const life = (await inbox(owner.headers)).items.filter(
      (item: { subject_id: string }) => item.subject_id === job.id,
    );
    expect(life.map((item: { event: string }) => item.event)).toEqual([
      "failed",
      "processing",
      "retry",
      "processing",
      "queued",
    ]);
    const dispatch = await db.query(
      "select 1 from journey_job_dispatch where job_id=$1",
      [job.id],
    );
    expect(dispatch.rowCount).toBe(0);

    const {
      rows: [trip],
    } = await db.query(
      "insert into trips(owner_user_id,title) values($1,'Synthetic trip') returning id",
      [owner.id],
    );
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'host'),($1,$3,'viewer')",
      [trip.id, owner.id, guest.id],
    );
    const {
      rows: [activity],
    } = await db.query(
      "insert into trip_activities(trip_id,title) values($1,'Synthetic activity') returning id",
      [trip.id],
    );
    const initial = (await inbox(guest.headers)).items;
    const seen = initial.find(
      (item: { subject_id: string }) => item.subject_id === activity.id,
    );
    expect(seen).toBeTruthy();
    await db.query(
      "update trip_members set status='removed' where trip_id=$1 and user_id=$2",
      [trip.id, guest.id],
    );
    const after = (await inbox(guest.headers)).items;
    expect(after).toEqual([
      expect.objectContaining({ event: "removed", trip_id: null }),
    ]);
    expect(
      (
        await request.patch(`/api/notifications/${seen.id}/read`, {
          headers: guest.headers,
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.get(`/api/trips/${trip.id}/workspace`, {
          headers: guest.headers,
        })
      ).status(),
    ).toBe(404);
  } finally {
    await db.query("delete from trips where owner_user_id=$1", [owner.id]);
    await db.query("delete from users where id=any($1::uuid[])", [
      [owner.id, guest.id],
    ]);
    await db.end();
  }
});

test("a catalog job completes with no AI calls under the runtime database role", async ({ request }) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const owner = await signUp(request);
  const city = `catalog-${randomUUID()}`;
  try {
    await db.query(
      "insert into cities(slug,name,country,timezone,currency,lat,lon) values($1,$2,'VN','Asia/Ho_Chi_Minh','USD',21,105)",
      [city, { en: city }],
    );
    for (const [category, count] of [["attraction", 4], ["restaurant", 3], ["cafe", 1]] as const)
      for (let i = 0; i < count; i++)
        await db.query(
          "insert into place_catalog(name,category,city_slug,source,last_verified_at) values($1,$2,$3,'verified_catalog',now())",
          [`${category} ${i}`, category, city],
        );
    await db.query(
      `insert into planning_day_templates(city_slug,place_ids,activity_ids,source,approved,verified_at)
       select $1,array_agg(id),'{}','verified_catalog',true,now() from place_catalog where city_slug=$1`,
      [city],
    );
    const planning = createPlanningCriteria();
    planning.journey.origin = { label: city, source: "manual" };
    planning.journey.destinations = [city];
    planning.stay_preferences.type = "none";
    planning.dining_preferences.independent_only = false;
    const { rows: [{ id }] } = await db.query(
      "insert into itinerary_jobs(user_id,kind,payload,planning_reuse) values($1,'generate',$2,true) returning id",
      [owner.id, { dto: { cities: [city], num_days: 1, currency: "USD", trip_style: "mixed", num_travelers: 2, planning } }],
    );
    await expect.poll(async () => {
      const response = await request.get(`/api/itinerary/jobs/${id}`, { headers: owner.headers });
      return response.json();
    }).toMatchObject({ status: "complete", itinerary_id: expect.any(String) });
    // Itinerary completion queues a separate worker that writes catalog rows.
    await expect.poll(async () => (await db.query(
      `select ingestion.status
       from city_catalog_ingestion_jobs ingestion
       join itinerary_jobs job on job.itinerary_id = ingestion.itinerary_id
       where job.id = $1`,
      [id],
    )).rows[0]?.status).toBe("completed");
    await expect.poll(async () => (await db.query(
      "select strategy,outcome,catalog_days,ai_days,calls from planning_ai_attempts where job_id=$1", [id],
    )).rows[0]).toEqual({ strategy: "catalog", outcome: "complete", catalog_days: 1, ai_days: 0, calls: [] });
    const report = JSON.parse(execFileSync(process.execPath, [
      "scripts/report-planning-usage.mjs",
      new Date(Date.now() - 60_000).toISOString(),
      new Date(Date.now() + 60_000).toISOString(),
    ], {
      encoding: "utf8",
      env: { ...process.env, PLANNING_METRICS_DATABASE_URL: process.env.E2E_POSTGRES_URL },
    }));
    expect(report.summary).toEqual(expect.arrayContaining([
      expect.objectContaining({ strategy: "catalog", destination: city, complete: 1, calls: 0, catalogDayShare: 1, neuronsPerCompleted: 0 }),
    ]));
  } finally {
    await db.query("delete from itineraries where user_id=$1", [owner.id]);
    await db.query("delete from users where id=$1", [owner.id]);
    await db.query("delete from planning_day_templates where city_slug=$1", [city]);
    await db.query("delete from activity_catalog where city_slug=$1", [city]);
    await db.query("delete from place_catalog where city_slug=$1", [city]);
    await db.query("delete from cities where slug=$1", [city]);
    await db.end();
  }
});
