import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";
const { Client } = createRequire(`${process.cwd()}/apps/server/package.json`)(
  "pg",
);

test("SMTP recovery: one-use token, expiry, concurrency, password update and session revocation", async ({
  request,
}) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const email = `recovery-${randomUUID()}@test.invalid`;
  const oldPassword = "Old-password-93!";
  const password = "New-password-93!";
  let userId: string | undefined;
  const forgot = (address: string) =>
    request.post("/api/auth/forgot-password", { data: { email: address } });
  const reset = (token: string, value = password) =>
    request.post("/api/auth/reset-password", {
      data: { token, password: value },
    });
  async function emailToken() {
    const messages = await (
      await request.get("http://127.0.0.1:3350/messages")
    ).json();
    // Nodemailer folds quoted-printable lines at 76 columns.
    const raw = messages
      .filter((m: any) => m.to.includes(email))
      .at(-1)
      .raw.replace(/=\r?\n/g, "")
      .replace(/=3D/g, "=");
    return raw.match(/recovery_token=([a-f0-9]{64})/)[1] as string;
  }
  try {
    const signup = await request.post("/api/auth/register", {
      data: { email, password: oldPassword },
    });
    expect(signup.status()).toBe(201);
    const user = await signup.json();
    userId = user.user.id;
    const response = await forgot(email.toUpperCase());
    expect(response.status()).toBe(200);
    const firstToken = await emailToken();
    expect(JSON.stringify(await response.json())).not.toContain(firstToken);
    const stored = await db.query(
      "select token_hash from private.password_resets where user_id = $1",
      [userId],
    );
    expect(stored.rows[0].token_hash).toBe(
      createHash("sha256").update(firstToken).digest("hex"),
    );
    expect(stored.rows[0].token_hash).not.toBe(firstToken);
    const unknown = await forgot(`missing-${randomUUID()}@test.invalid`);
    expect(await unknown.json()).toEqual(await response.json());
    expect((await reset(firstToken, "short")).status()).toBe(400);
    expect((await reset("f".repeat(64))).status()).toBe(400);
    const results = await Promise.all([reset(firstToken), reset(firstToken)]);
    expect(results.map((r) => r.status()).sort()).toEqual([200, 400]);
    expect((await reset(firstToken)).status()).toBe(400);
    expect(
      (
        await request.post("/api/auth/refresh", {
          data: { refresh_token: user.session.refresh_token },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await request.get("/api/auth/me", {
          headers: { authorization: `Bearer ${user.session.access_token}` },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await request.post("/api/auth/session", {
          data: { email, password: oldPassword },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await request.post("/api/auth/session", { data: { email, password } })
      ).status(),
    ).toBe(200);

    await forgot(email);
    const expiredToken = await emailToken();
    await db.query(
      "update private.password_resets set expires_at = now() - interval '1 second', created_at = now() - interval '2 minutes' where user_id = $1",
      [userId],
    );
    expect((await reset(expiredToken)).status()).toBe(400);
    await forgot(email);
    const replacement = await emailToken();
    expect(replacement).not.toBe(expiredToken);
    expect((await reset(expiredToken)).status()).toBe(400);
    // Cooldown must not invalidate the most recently delivered link.
    await forgot(email);
    expect((await reset(replacement)).status()).toBe(200);
    expect((await forgot(email)).status()).toBe(429);
  } finally {
    if (userId) await db.query("delete from users where id = $1", [userId]);
    await db.end();
  }
});
