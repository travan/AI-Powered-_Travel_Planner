import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
const { Client } = createRequire(`${process.cwd()}/apps/server/package.json`)(
  "pg",
);
let db: any;
const users: string[] = [];
test.beforeAll(async () => {
  db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
});
test.afterAll(async () => {
  if (users.length) {
    await db.query("delete from trips where owner_user_id=any($1::uuid[])", [
      users,
    ]);
    await db.query("delete from itineraries where user_id=any($1::text[])", [
      users,
    ]);
    await db.query("delete from users where id=any($1::uuid[])", [users]);
  }
  await db.end();
});
test("bilingual identity, transactional memory, approved costs, feedback privacy and training export", async ({
  request,
}) => {
  const signup = async () => {
    const r = await request.post("/api/auth/register", {
      data: {
        email: `learning-${randomUUID()}@test.invalid`,
        password: "Test-password-9x!",
      },
    });
    expect(r.ok()).toBeTruthy();
    const b = await r.json();
    users.push(b.user.id);
    return {
      id: b.user.id,
      headers: { Authorization: `Bearer ${b.session.access_token}` },
    };
  };
  const a = await signup(),
    b = await signup();
  const vi = await request.post("/api/cities", {
    headers: a.headers,
    data: { name: "Đài Bắc" },
  });
  expect(vi.ok()).toBeTruthy();
  const en = await request.post("/api/cities", {
    headers: a.headers,
    data: { name: "Taipei" },
  });
  expect((await vi.json()).slug).toBe((await en.json()).slug);
  const folded = await request.post("/api/cities", {
    headers: a.headers,
    data: { name: "bac kinh" },
  });
  expect((await folded.json()).name.en).toBe("Beijing");
  await request.post("http://127.0.0.1:3349/scenario", {
    data: { mode: "learning-quality" },
  });
  const input = {
    cities: ["tokyo"],
    city_names: ["Đông Kinh"],
    num_days: 1,
    num_travelers: 1,
    currency: "USD",
    trip_style: "mixed",
    locale: "en",
    start_date: "2026-11-04",
    end_date: "2026-11-04",
  };
  const generated = await request.post("/api/itinerary/generate", {
    headers: a.headers,
    data: input,
  });
  expect(generated.ok(), await generated.text()).toBeTruthy();
  const first = await generated.json();
  expect(first.result.days[0].city_slug).toBe("tokyo");
  const repeat = await request.post("/api/itinerary/generate", {
    headers: a.headers,
    data: input,
  });
  expect((await repeat.json()).cache_hit).toBe(true);
  const events = await db.query(
    "select event_type,count(*)::int as n from planner_learning_events where user_id=$1 group by event_type",
    [a.id],
  );
  expect(events.rows).toEqual(
    expect.arrayContaining([
      { event_type: "generation_request", n: 2 },
      { event_type: "plan_returned", n: 2 },
      { event_type: "plan_complete", n: 1 },
    ]),
  );
  expect(
    (
      await request.post(`/api/itinerary/${first.itinerary_id}/feedback`, {
        headers: b.headers,
        data: { rating: 5, note: "steal" },
      })
    ).status(),
  ).toBe(403);
  const feedback = await request.post(
    `/api/itinerary/${first.itinerary_id}/feedback`,
    {
      headers: a.headers,
      data: {
        rating: 5,
        note: "Prefer quiet cafes. contact private@example.invalid",
      },
    },
  );
  expect(feedback.ok(), await feedback.text()).toBeTruthy();
  const saved = await request.post(
    `/api/itinerary/${first.itinerary_id}/save`,
    { headers: a.headers },
  );
  expect(saved.ok()).toBeTruthy();
  const tripId = (await saved.json()).trip_id;
  for (const amount of [10, 15, 20]) {
    const r = await request.post(`/api/trips/${tripId}/expenses`, {
      headers: a.headers,
      data: {
        title: "Meal",
        amount,
        currency: "USD",
        expense_type: "food",
        split_strategy: "equal",
        participant_user_ids: [a.id],
      },
    });
    expect(r.ok(), await r.text()).toBeTruthy();
    const expense = await r.json();
    expect(expense.expenseType).toBe("food");
    const approve = await request.patch(
      `/api/trips/${tripId}/expenses/${expense.id}`,
      { headers: a.headers, data: { status: "approved" } },
    );
    expect(approve.ok(), await approve.text()).toBeTruthy();
  }
  const next = await request.post("/api/itinerary/generate", {
    headers: a.headers,
    data: {
      ...input,
      prompt_text: "Create another trip with better food details.",
    },
  });
  expect(next.ok(), await next.text()).toBeTruthy();
  const learned = await next.json();
  expect(learned.result.learning_summary).toMatchObject({
    approved_expense_samples: 3,
  });
  const calls = await (await request.get("http://127.0.0.1:3349/calls")).json();
  expect(calls.prompts.at(-1)).toContain("Prefer quiet cafes");
  expect(calls.prompts.at(-1)).toContain('"median_amount":15');
  expect(calls.prompts.at(-1)).not.toContain("private@example.invalid");
  const isolated = await request.post("/api/itinerary/generate", {
    headers: b.headers,
    data: { ...input, prompt_text: "Another owner" },
  });
  expect((await isolated.json()).result.learning_summary).toEqual({
    past_plans: 0,
    approved_expense_samples: 0,
  });
  expect(
    (
      await request.get("/api/learning/dataset", { headers: a.headers })
    ).status(),
  ).toBe(400);
  const setting = await request.patch("/api/learning/settings", {
    headers: a.headers,
    data: { training_consent: true },
  });
  expect(setting.ok()).toBeTruthy();
  const exported = await request.get("/api/learning/dataset", {
    headers: a.headers,
  });
  expect(exported.ok(), await exported.text()).toBeTruthy();
  const text = await exported.text();
  expect(text).not.toContain(a.id);
  expect(text).not.toContain("private@example.invalid");
  expect(text).not.toContain("Prefer quiet cafes");
  const records = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(records.some((r) => r.quality.source === "user_reviewed")).toBe(true);
  expect(records.some((r) => r.quality.source === "approved_spending")).toBe(
    true,
  );
  await request.patch("/api/learning/settings", {
    headers: a.headers,
    data: { memory_enabled: false },
  });
  const disabled = await request.post("/api/itinerary/generate", {
    headers: a.headers,
    data: { ...input, prompt_text: "Memory disabled" },
  });
  expect((await disabled.json()).result.learning_summary).toEqual({
    past_plans: 0,
    approved_expense_samples: 0,
  });
});

test("a retained legacy alias does not duplicate the identified city in search", async ({
  request,
}) => {
  const slug = `legacy-beijing-${randomUUID()}`;
  try {
    await db.query(
      `insert into cities(slug,name,country,timezone,currency,lat,lon) values($1,'{"en":"Bắc Kinh","vi":"Bắc Kinh"}','','','',null,null)`,
      [slug],
    );
    const response = await request.get("/api/cities/search?q=bac%20kinh");
    expect(response.ok()).toBeTruthy();
    const cities = await response.json();
    expect(cities.map((city: any) => city.slug)).toEqual(["beijing"]);
    expect(cities[0].name).toEqual({ en: "Beijing", vi: "Bắc Kinh" });
  } finally {
    await db.query("delete from cities where slug=$1", [slug]);
  }
});
