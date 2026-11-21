import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { queuedScenario } from "../fixtures/index.mjs";

const { Client } = createRequire(`${process.cwd()}/apps/server/package.json`)(
  "pg",
);
async function register(request: APIRequestContext) {
  const email = `collaboration-${randomUUID()}@test.invalid`;
  const response = await request.post("/api/auth/register", {
    data: { email, password: "Test-password-9x!" },
  });
  expect(response.status(), await response.text()).toBe(201);
  const { user, session } = await response.json();
  return {
    id: user.id as string,
    email,
    headers: { Authorization: `Bearer ${session.access_token}` },
  };
}

test("read all covers every page, preserves another user's unread items, and labels checklist tasks", async ({
  request,
}) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const owner = await register(request);
  const other = await register(request);
  try {
    const {
      rows: [trip],
    } = await db.query(
      "insert into trips(owner_user_id,title) values($1,'Mountain weekend') returning id",
      [owner.id],
    );
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'host'),($1,$3,'viewer')",
      [trip.id, owner.id, other.id],
    );
    for (let n = 0; n < 30; n++)
      await db.query(
        "insert into trip_checklist_items(trip_id,title) values($1,$2)",
        [trip.id, `Checklist task ${n}`],
      );
    const first = await request.get("/api/notifications", {
      headers: owner.headers,
    });
    expect(first.ok(), await first.text()).toBeTruthy();
    const page = await first.json();
    expect(page.items).toHaveLength(25);
    expect(page.next).toBeTruthy();
    expect(
      page.items.filter(
        (item: { category: string }) => item.category === "checklist",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject_label: expect.stringMatching(/^Checklist task /),
          trip_title: "Mountain weekend",
        }),
      ]),
    );
    const unread = async (headers: typeof owner.headers) =>
      (
        await (
          await request.get("/api/notifications/unread", { headers })
        ).json()
      ).count;
    const before = await unread(owner.headers);
    const otherBefore = await unread(other.headers);
    expect(before).toBeGreaterThanOrEqual(30);
    expect((await request.patch("/api/notifications/read-all")).status()).toBe(
      401,
    );
    const all = await request.patch("/api/notifications/read-all", {
      headers: owner.headers,
    });
    expect(all.ok(), await all.text()).toBeTruthy();
    expect(await all.json()).toMatchObject({
      read: true,
      updated_count: before,
      read_at: expect.any(String),
    });
    expect(await unread(owner.headers)).toBe(0);
    expect(await unread(other.headers)).toBe(otherBefore);
    const second = await (
      await request.get(`/api/notifications?before=${page.next}`, {
        headers: owner.headers,
      })
    ).json();
    expect(second.items.length).toBeGreaterThan(0);
    expect(
      second.items.every((item: { read_at: string | null }) => item.read_at),
    ).toBe(true);
    await db.query(
      "insert into trip_checklist_items(trip_id,title) values($1,'New after read-all')",
      [trip.id],
    );
    expect(await unread(owner.headers)).toBe(1);
    expect(
      (
        await (
          await request.patch("/api/notifications/read-all", {
            headers: owner.headers,
          })
        ).json()
      ).updated_count,
    ).toBe(1);
  } finally {
    await db.query("delete from trips where owner_user_id=$1", [owner.id]);
    await db.query("delete from users where id=any($1::uuid[])", [
      [owner.id, other.id],
    ]);
    await db.end();
  }
});

test("public share is owner-controlled, sanitized, revocable and does not make the private URL public", async ({
  request,
}) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const owner = await register(request);
  const other = await register(request);
  const marker = "private-share-sentinel";
  try {
    const plan = structuredClone(queuedScenario.itinerary.itineraries[0]);
    Object.assign(plan, {
      planning: { private_request: marker },
      prompt_text: marker,
      ai_usage: [{ model: marker }],
      learning_summary: { marker },
    });
    Object.assign(plan.days[0], { booking_reference: marker });
    const {
      rows: [row],
    } = await db.query(
      "insert into itineraries(user_id,status,result) values($1,'complete',$2) returning id",
      [owner.id, plan],
    );
    const url = `/api/itinerary/${row.id}`;
    expect((await request.get(url)).status()).toBe(404);
    expect(
      (
        await request.get(url, {
          headers: { Authorization: `Bearer mock-access-${owner.id}` },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.patch(`${url}/share`, { headers: other.headers })
      ).status(),
    ).toBe(404);
    const own = await request.get(url, { headers: owner.headers });
    expect((await own.json()).can_share).toBe(true);
    const share = await request.patch(`${url}/share`, {
      headers: owner.headers,
    });
    expect(share.ok(), await share.text()).toBeTruthy();
    const { share_token: token, share_url } = await share.json();
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(share_url).toContain(`/shared/${token}`);
    const publicUrl = `/api/itinerary/shared/${token}`;
    const publicResponse = await request.get(publicUrl);
    expect(publicResponse.ok(), await publicResponse.text()).toBeTruthy();
    expect(publicResponse.headers()["cache-control"]).toBe("private, no-store");
    const publicText = await publicResponse.text();
    expect(publicText).not.toContain(marker);
    expect(JSON.parse(publicText).itineraries[0]).toMatchObject({
      title: plan.title,
      days: expect.any(Array),
    });
    expect((await request.get(url)).status()).toBe(404);
    expect(
      (
        await request.delete(`${url}/share`, { headers: other.headers })
      ).status(),
    ).toBe(404);
    expect(
      (await request.delete(`${url}/share`, { headers: owner.headers })).ok(),
    ).toBeTruthy();
    expect((await request.get(publicUrl)).status()).toBe(404);
    const next = await (
      await request.patch(`${url}/share`, { headers: owner.headers })
    ).json();
    expect(next.share_token).not.toBe(token);
  } finally {
    await db.query("delete from itineraries where user_id=$1", [owner.id]);
    await db.query("delete from users where id=any($1::uuid[])", [
      [owner.id, other.id],
    ]);
    await db.end();
  }
});

test("invitation email reaches local SMTP, retries failure, enforces managers and stops after acceptance", async ({
  request,
}) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const owner = await register(request);
  const guest = await register(request);
  try {
    const {
      rows: [trip],
    } = await db.query(
      "insert into trips(owner_user_id,title) values($1,'SMTP weekend') returning id",
      [owner.id],
    );
    await db.query(
      "insert into trip_members(trip_id,user_id,role) values($1,$2,'host')",
      [trip.id, owner.id],
    );
    const create = () =>
      request.post(`/api/trips/${trip.id}/invites`, {
        headers: owner.headers,
        data: { email: guest.email, role: "contributor" },
      });
    await request.delete("http://127.0.0.1:3350/messages");
    await request.post("http://127.0.0.1:3350/fail-next");
    const response = await create();
    expect(response.ok(), await response.text()).toBeTruthy();
    const invite = await response.json();
    expect(invite.emailStatus).toBe("failed");
    const base = `/api/trips/${trip.id}/invites/${invite.id}`;
    expect(
      (
        await request.post(`${base}/resend`, { headers: guest.headers })
      ).status(),
    ).toBe(404);
    const resent = await request.post(`${base}/resend`, {
      headers: owner.headers,
    });
    expect(resent.ok(), await resent.text()).toBeTruthy();
    expect(await resent.json()).toMatchObject({
      emailStatus: "sent",
      sentAt: expect.any(String),
    });
    const messages = await (
      await request.get("http://127.0.0.1:3350/messages")
    ).json();
    expect(messages).toHaveLength(1);
    expect(messages[0].to).toEqual([guest.email]);
    // Decode quoted printable line wrapping used by the SMTP transport.
    const raw = messages[0].raw
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-F]{2})/gi, (_: string, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
    expect(raw).toContain(`token=${invite.token}&type=invite`);
    expect(raw).toContain("contributor");
    expect(
      (
        await request.post("/api/trips/join/invite", {
          headers: owner.headers,
          data: { token: invite.token },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await request.post("/api/trips/join/invite", {
          headers: guest.headers,
          data: { token: invite.token },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await (
          await request.post(`${base}/resend`, { headers: owner.headers })
        ).json()
      ).emailStatus,
    ).toBe("cancelled");
    expect(
      await (await request.get("http://127.0.0.1:3350/messages")).json(),
    ).toHaveLength(1);
  } finally {
    await db.query("delete from trips where owner_user_id=$1", [owner.id]);
    await db.query("delete from users where id=any($1::uuid[])", [
      [owner.id, guest.id],
    ]);
    await db.end();
  }
});
