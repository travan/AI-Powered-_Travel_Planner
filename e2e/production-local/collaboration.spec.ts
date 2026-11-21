import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { test, expect } from "../specs/helpers/test-fixtures";
import { queuedScenario } from "../fixtures/index.mjs";
const { Client } = createRequire(`${process.cwd()}/apps/server/package.json`)("pg");
const api = "http://127.0.0.1:8787";

test("production workerd supports public links, read-all and honest missing-SMTP delivery status", async ({ request, page }) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  let userId: string | undefined;
  try {
    const registered = await request.post(`${api}/api/auth/register`, { data: {
      email: `collaboration-workerd-${randomUUID()}@test.invalid`, password: "Local-test-password-93!",
    } });
    expect(registered.status(), await registered.text()).toBe(201);
    const auth = await registered.json();
    userId = auth.user.id;
    const headers = { authorization: `Bearer ${auth.session.access_token}` };
    const { rows: [itinerary] } = await db.query("insert into itineraries(user_id,status,result) values($1,'complete',$2) returning id", [userId, queuedScenario.itinerary.itineraries[0]]);
    const { rows: [trip] } = await db.query("insert into trips(owner_user_id,title) values($1,'Human readable trip title') returning id", [userId]);
    await db.query("insert into trip_members(trip_id,user_id,role) values($1,$2,'host')", [trip.id, userId]);
    const invite = await request.post(`${api}/api/trips/${trip.id}/invites`, { headers, data: { email: "local-only@test.invalid", role: "viewer" } });
    expect(invite.ok(), await invite.text()).toBeTruthy();
    const created = await invite.json();
    expect(created.emailStatus).toBe("not_configured");
    expect(created.token).toBeTruthy();
    expect((await db.query("select status,attempts from trip_invite_mail where invite_id=$1", [created.id])).rows[0]).toEqual({ status: "pending", attempts: 0 });
    const workspace = await request.get(`${api}/api/trips/${trip.id}/workspace`, { headers });
    expect((await workspace.json()).title).toBe("Human readable trip title");
    const read = await request.patch(`${api}/api/notifications/read-all`, { headers });
    expect(read.ok(), await read.text()).toBeTruthy();
    expect((await (await request.get(`${api}/api/notifications/unread`, { headers })).json()).count).toBe(0);
    const share = await request.patch(`${api}/api/itinerary/${itinerary.id}/share`, { headers });
    expect(share.ok(), await share.text()).toBeTruthy();
    const { share_url: url } = await share.json();
    expect(new URL(url).origin).toBe("http://127.0.0.1:3352");
    await page.goto(url);
    await expect(page.getByText("Shared itinerary · Read only")).toBeVisible();
    await expect(page.getByRole("heading", { name: queuedScenario.itinerary.itineraries[0].title })).toBeVisible();
    expect((await request.delete(`${api}/api/itinerary/${itinerary.id}/share`, { headers })).ok()).toBeTruthy();
    expect((await page.reload())?.status()).toBe(404);
  } finally {
    if (userId) {
      await db.query("delete from trips where owner_user_id=$1", [userId]);
      await db.query("delete from itineraries where user_id=$1", [userId]);
      await db.query("delete from users where id=$1", [userId]);
    }
    await db.end();
  }
});
