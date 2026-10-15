import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";
const { Client } = createRequire(`${process.cwd()}/apps/server/package.json`)(
  "pg",
);
let db: any;
let userId: string;
let token: string;

test.beforeAll(async () => {
  db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
});
test.afterAll(async () => {
  await db?.end();
});
test.beforeEach(async ({ request }) => {
  userId = "";
  await request.post("http://127.0.0.1:3349/scenario", {
    data: { mode: "success" },
  });
  const signup = await request.post("/api/auth/register", {
    data: {
      email: `ai-${randomUUID()}@test.invalid`,
      password: "Test-password-9x!",
      full_name: "AI E2E",
    },
  });
  expect(signup.ok()).toBeTruthy();
  const body = await signup.json();
  userId = body.user.id;
  token = body.session.access_token;
});
test.afterEach(async () => {
  if (!userId) return;
  await db.query("delete from trips where owner_user_id = $1", [userId]);
  await db.query("delete from itineraries where user_id = $1", [userId]);
  await db.query("delete from users where id = $1", [userId]);
});
const input = {
  cities: ["tokyo"],
  city_names: ["Tokyo"],
  num_days: 1,
  currency: "USD",
  trip_style: "mid_range",
  num_travelers: 1,
};

test("Qwen response is normalized, persisted, catalogued, saved idempotently and reopened", async ({
  request,
}) => {
  const headers = { Authorization: `Bearer ${token}` };
  const response = await request.post("/api/itinerary/generate", {
    headers,
    data: input,
  });
  expect(response.ok()).toBeTruthy();
  const generated = await response.json();
  expect(generated.status).toBe("cached");
  expect(generated.result.days[0].activities[0].name).toBe("Senso-ji");
  const stored = await db.query(
    "select status, result from itineraries where id = $1",
    [generated.itinerary_id],
  );
  expect(stored.rows[0].status).toBe("complete");
  expect(stored.rows[0].result).toEqual(generated.result);
  await expect
    .poll(
      async () =>
        (
          await db.query(
            "select status from city_catalog_ingestion_jobs where itinerary_id = $1",
            [generated.itinerary_id],
          )
        ).rows[0]?.status,
    )
    .toBe("completed");
  const save = await request.post(
    `/api/itinerary/${generated.itinerary_id}/save`,
    { headers },
  );
  expect(save.ok()).toBeTruthy();
  const saved = await save.json();
  const repeated = await request.post(
    `/api/itinerary/${generated.itinerary_id}/save`,
    { headers },
  );
  expect(await repeated.json()).toEqual(saved);
  const reopened = await request.get(`/api/itinerary/trips/${saved.trip_id}`, {
    headers,
  });
  expect(reopened.ok()).toBeTruthy();
  expect((await reopened.json()).itinerary.days[0].activities[0].name).toBe(
    "Senso-ji",
  );
});

for (const [mode, code] of [
  ["http-error", "AI_UNAVAILABLE"],
  ["malformed", "AI_UNAVAILABLE"],
  ["empty", "AI_UNAVAILABLE"],
  ["no-days", "NO_ITINERARY"],
]) {
  test(`persists ${mode} failure without creating a catalog job`, async ({
    request,
  }) => {
    await request.post("http://127.0.0.1:3349/scenario", { data: { mode } });
    const response = await request.post("/api/itinerary/generate", {
      headers: { Authorization: `Bearer ${token}` },
      data: input,
    });
    expect(response.ok()).toBeTruthy();
    expect(await response.json()).toMatchObject({
      status: "unsupported",
      code,
    });
    const rows = await db.query(
      "select id, status, result from itineraries where user_id = $1",
      [userId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      status: "failed",
      result: { error: { provider: "ollama", code } },
    });
    const jobs = await db.query(
      "select id from city_catalog_ingestion_jobs where itinerary_id = $1",
      [rows.rows[0].id],
    );
    expect(jobs.rows).toHaveLength(0);
    const save = await request.post(`/api/itinerary/${rows.rows[0].id}/save`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(save.status()).toBe(404);
  });
}

test("guest search draft can be claimed and retrieved as the same stored request", async ({
  request,
}) => {
  const guest_key = randomUUID();
  const draft = await request.post("/api/search-drafts", {
    data: {
      guest_key,
      prompt_text: "Tokyo for one day",
      search_payload: input,
    },
  });
  expect(draft.ok()).toBeTruthy();
  const created = await draft.json();
  try {
    const claimed = await request.post(
      `/api/search-drafts/${created.id}/claim`,
      { headers: { Authorization: `Bearer ${token}` }, data: { guest_key } },
    );
    expect(claimed.ok()).toBeTruthy();
    expect(await claimed.json()).toMatchObject({
      id: created.id,
      user_id: userId,
      status: "claimed",
      search_payload: input,
    });
    const again = await request.post(`/api/search-drafts/${created.id}/claim`, {
      headers: { Authorization: `Bearer ${token}` }, data: { guest_key },
    });
    expect(again.ok()).toBeTruthy();
    expect(await again.json()).toMatchObject({ id: created.id, user_id: userId, search_payload: input });
    const wrongKey = await request.post(`/api/search-drafts/${created.id}/claim`, {
      headers: { Authorization: `Bearer ${token}` }, data: { guest_key: randomUUID() },
    });
    expect(wrongKey.status()).toBe(404);
    const other = await request.post("/api/auth/register", { data: { email: `other-${randomUUID()}@test.invalid`, password: "Test-password-9x!" } });
    const otherUser = await other.json();
    try {
      const stolen = await request.post(`/api/search-drafts/${created.id}/claim`, {
        headers: { Authorization: `Bearer ${otherUser.session.access_token}` }, data: { guest_key },
      });
      expect(stolen.status()).toBe(404);
    } finally { await db.query("delete from users where id = $1", [otherUser.user.id]); }
  } finally {
    await db.query("delete from search_drafts where id = $1", [created.id]);
  }
});

test("manual cities support Unicode names, search, detail and duplicate reuse", async ({
  request,
}) => {
  const name = `Đà Lạt ${randomUUID().slice(0, 8)}`;
  const headers = { Authorization: `Bearer ${token}` };
  const response = await request.post("/api/cities", {
    headers,
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
  const city = await response.json();
  try {
    expect(city.lat).toBeNull();
    const repeated = await request.post("/api/cities", {
      headers,
      data: { name },
    });
    expect((await repeated.json()).slug).toBe(city.slug);
    const search = await request.get(
      `/api/cities/search?q=${encodeURIComponent(name)}`,
    );
    expect(await search.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: city.slug })]),
    );
    const detail = await request.get(`/api/cities/${city.slug}`);
    expect(detail.ok()).toBeTruthy();
    expect((await detail.json()).slug).toBe(city.slug);
  } finally {
    await db.query("delete from cities where slug = $1", [city.slug]);
  }
});

test("saved workspace supports activities, participation, transport, bills, expenses, review and audit", async ({
  request,
}) => {
  const headers = { Authorization: `Bearer ${token}` };
  async function call(
    method: "get" | "post" | "patch",
    path: string,
    data?: unknown,
  ) {
    const response = await request[method](path, { headers, data });
    expect(
      response.ok(),
      `${method} ${path}: ${await response.text()}`,
    ).toBeTruthy();
    return response.json();
  }
  const generated = await call("post", "/api/itinerary/generate", input);
  const { trip_id } = await call(
    "post",
    `/api/itinerary/${generated.itinerary_id}/save`,
  );
  const base = `/api/trips/${trip_id}`;
  expect((await call("get", "/api/trips")).length).toBeGreaterThan(0);
  expect((await call("get", base)).id).toBe(trip_id);
  expect(await call("get", `${base}/members`)).toEqual(
    expect.arrayContaining([expect.objectContaining({ userId, role: "host" })]),
  );
  expect(await call("get", `${base}/membership`)).toMatchObject({
    role: "host",
  });
  const activity = await call("post", `${base}/activities`, {
    title: "Temple visit",
    category: "attraction",
    currency: "USD",
  });
  expect(
    await call("patch", `${base}/activities/${activity.id}`, {
      title: "Morning temple visit",
    }),
  ).toMatchObject({ title: "Morning temple visit" });
  expect(
    await call(
      "patch",
      `${base}/activities/${activity.id}/participants/${userId}`,
      { status: "joined" },
    ),
  ).toMatchObject({ status: "joined" });
  const transport = await call("post", `${base}/transport-bookings`, {
    mode: "train",
    origin_name: "Tokyo",
    destination_name: "Asakusa",
    price: 5,
    currency: "USD",
    participant_user_ids: [userId],
  });
  expect(
    await call("patch", `${base}/transport-bookings/${transport.id}`, {
      booking_status: "ticketed",
    }),
  ).toMatchObject({ bookingStatus: "ticketed" });
  expect(await call("get", `${base}/transport-bookings`)).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: transport.id })]),
  );
  const bill = await call("post", `${base}/bills`, {
    activity_id: activity.id,
    raw_text: "Temple tickets total 10 USD",
    total_amount: 10,
    currency: "USD",
  });
  expect(
    await call("patch", `/api/bills/${bill.id}`, {
      merchant_name: "Temple tickets",
    }),
  ).toMatchObject({ merchantName: "Temple tickets" });
  expect((await call("get", `/api/bills/${bill.id}`)).id).toBe(bill.id);
  const expense = await call("post", `${base}/expenses`, {
    title: "Temple tickets",
    amount: 10,
    currency: "USD",
    activity_id: activity.id,
    bill_upload_id: bill.id,
    participant_user_ids: [userId],
    split_strategy: "equal",
  });
  expect(expense.splits).toHaveLength(1);
  expect(
    await call("patch", `${base}/expenses/${expense.id}`, {
      title: "Confirmed tickets",
    }),
  ).toMatchObject({ title: "Confirmed tickets" });
  expect(
    await call(
      "patch",
      `${base}/expenses/${expense.id}/splits/${expense.splits[0].id}`,
      { status: "settled" },
    ),
  ).toMatchObject({ status: "settled" });
  expect(await call("get", `${base}/expenses`)).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: expense.id })]),
  );
  expect(Array.isArray(await call("get", `${base}/activities`))).toBe(true);
  expect(Array.isArray(await call("get", `${base}/review-queue`))).toBe(true);
  expect(Array.isArray(await call("get", `${base}/data-quality-signals`))).toBe(
    true,
  );
  expect((await call("get", `${base}/audit-logs`)).length).toBeGreaterThan(0);
  expect(
    Array.isArray(
      await call("get", "/api/recommendations/places?citySlug=tokyo"),
    ),
  ).toBe(true);
  expect(
    Array.isArray(await call("get", "/api/activities/catalog?citySlug=tokyo")),
  ).toBe(true);
});

test("invites, share links, member roles and contributor review persist through the real API", async ({
  request,
}) => {
  const headers = { Authorization: `Bearer ${token}` };
  async function call(
    method: "get" | "post" | "patch",
    path: string,
    data?: unknown,
    auth = headers,
  ) {
    const response = await request[method](path, { headers: auth, data });
    expect(
      response.ok(),
      `${method} ${path}: ${await response.text()}`,
    ).toBeTruthy();
    return response.json();
  }
  const guest = await call("post", "/api/auth/register", {
    email: `guest-${randomUUID()}@test.invalid`,
    password: "Test-password-9x!",
    full_name: "Guest",
  });
  const guestHeaders = {
    Authorization: `Bearer ${guest.session.access_token}`,
  };
  try {
    const generated = await call("post", "/api/itinerary/generate", input);
    const { trip_id } = await call(
      "post",
      `/api/itinerary/${generated.itinerary_id}/save`,
    );
    const base = `/api/trips/${trip_id}`;
    const invite = await call("post", `${base}/invites`, {
      email: guest.user.email,
      role: "contributor",
    });
    expect(
      await call(
        "post",
        "/api/trips/join/invite",
        { token: invite.token },
        guestHeaders,
      ),
    ).toMatchObject({ userId: guest.user.id, role: "contributor" });
    const activity = await call(
      "post",
      `${base}/activities`,
      { title: "Contributor temple", currency: "USD", category: "attraction" },
      guestHeaders,
    );
    expect(activity.status).toBe("pending_review");
    expect(await call("get", `${base}/review-queue`)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: activity.id }),
      ]),
    );
    await call("patch", `${base}/review-submissions`, {
      entity_type: "activity",
      entity_id: activity.id,
      decision: "approved",
    });
    expect(await call("get", `${base}/activities`)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: activity.id, status: "approved" }),
      ]),
    );
    expect(
      await call("patch", `${base}/members/${guest.user.id}`, {
        role: "viewer",
      }),
    ).toMatchObject({ role: "viewer" });
    const shared = await call("patch", `${base}/share-link`, {
      enabled: true,
      role: "viewer",
    });
    expect(
      await call(
        "post",
        "/api/trips/join/share-link",
        { token: shared.shareToken },
        guestHeaders,
      ),
    ).toMatchObject({ userId: guest.user.id, status: "active" });
    await call("patch", `${base}/share-link`, {
      enabled: false,
      role: "viewer",
    });
  } finally {
    await db.query("delete from trips where owner_user_id = $1", [userId]);
    await db.query("delete from users where id = $1", [guest.user.id]);
  }
});
