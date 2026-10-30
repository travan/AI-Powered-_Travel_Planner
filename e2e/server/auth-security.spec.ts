import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const { Client } = createRequire(`${process.cwd()}/apps/server/package.json`)(
  "pg",
);

test("real login sessions: rotation, hashed storage, forgery, revocation, expiry and cookie-only requests", async ({
  request,
}) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const email = `security-${randomUUID()}@test.invalid`;
  const password = "Security-test-password-93!";
  let userId: string | undefined;
  const me = (token: string) =>
    request.get("/api/auth/me", {
      headers: { authorization: `Bearer ${token}` },
    });
  const hash = (token: string) =>
    createHash("sha256").update(token).digest("hex");
  try {
    const registration = await request.post("/api/auth/register", {
      data: { email, password },
    });
    expect(registration.status()).toBe(201);
    const initial = await registration.json();
    userId = initial.user.id;
    const firstToken = initial.session.access_token;
    const stored = await db.query(
      "select password_hash from users where id = $1",
      [userId],
    );
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(stored.rows[0].password_hash).not.toContain(password);
    expect(JSON.stringify(initial)).not.toContain(stored.rows[0].password_hash);

    const failed = await request.post("/api/auth/session", {
      data: { email, password: "wrong-password" },
    });
    const missing = await request.post("/api/auth/session", {
      data: { email: `missing-${randomUUID()}@test.invalid`, password },
    });
    expect(failed.status()).toBe(401);
    expect(missing.status()).toBe(401);
    expect(await failed.json()).toEqual(await missing.json());
    const sessions = await db.query(
      "select token_hash from user_sessions where user_id = $1",
      [userId],
    );
    expect(sessions.rows).toEqual([{ token_hash: hash(firstToken) }]);

    const login = await request.post("/api/auth/session", {
      data: { email: email.toUpperCase(), password },
    });
    expect(login.status()).toBe(200);
    const secondToken = (await login.json()).session.access_token;
    expect(secondToken).not.toBe(firstToken);
    expect((await me(firstToken)).status()).toBe(200);
    expect((await me(secondToken)).status()).toBe(200);

    const [header, , signature] = secondToken.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ sub: randomUUID(), exp: 9999999999 }),
    ).toString("base64url");
    expect((await me(`${header}.${forgedPayload}.${signature}`)).status()).toBe(
      401,
    );
    expect((await me("mock-access-admin")).status()).toBe(401);
    expect((await request.get("/api/auth/me")).status()).toBe(401);
    // API authorization requires a bearer token even when a forged browser cookie exists.
    expect(
      (
        await request.get("/api/auth/me", {
          headers: {
            cookie: `horizon_local_auth=${encodeURIComponent(JSON.stringify(initial.session))}`,
          },
        })
      ).status(),
    ).toBe(401);

    expect(
      (
        await request.post("/api/auth/logout", {
          headers: { authorization: `Bearer ${firstToken}` },
        })
      ).status(),
    ).toBe(200);
    expect((await me(firstToken)).status()).toBe(401);
    expect((await me(secondToken)).status()).toBe(200);
    await db.query(
      "update user_sessions set expires_at = now() - interval '1 second' where token_hash = $1",
      [hash(secondToken)],
    );
    expect((await me(secondToken)).status()).toBe(401);
  } finally {
    if (userId) await db.query("delete from users where id = $1", [userId]);
    await db.end();
  }
});

test("browser HttpOnly cookies, CSRF rejection, refresh rotation, replay revocation and logout", async ({
  page,
  context,
  request,
}) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const email = `browser-security-${randomUUID()}@test.invalid`;
  const password = "Security-password-93!";
  let userId: string | undefined;
  const headers = { "x-auth-client": "web" };
  try {
    await page.goto("/health");
    const result = await page.evaluate(
      async ({ email, password }) => {
        const response = await fetch("/api/auth/register", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-auth-client": "web",
          },
          body: JSON.stringify({ email, password }),
        });
        return { status: response.status, body: await response.json() };
      },
      { email, password },
    );
    expect(result.status).toBe(201);
    userId = result.body.user.id;
    expect(result.body.session.expires_in).toBe(900);
    expect(result.body.session.refresh_token).toBe("");
    const cookies = await context.cookies();
    const refresh = cookies.find(
      (cookie) => cookie.name === "horizon_local_refresh",
    )!;
    const access = cookies.find(
      (cookie) => cookie.name === "horizon_local_auth",
    )!;
    expect(access).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
    expect(refresh).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      "horizon_local_",
    );
    const stored = await db.query(
      "select token_hash from private.refresh_tokens where user_id = $1",
      [userId],
    );
    expect(stored.rows).toEqual([
      { token_hash: createHash("sha256").update(refresh.value).digest("hex") },
    ]);
    expect(
      (await context.request.post("/api/auth/refresh", { data: {} })).status(),
    ).toBe(403);
    expect(
      (
        await context.request.post("/api/auth/refresh", {
          headers: { ...headers, "sec-fetch-site": "cross-site" },
          data: {},
        })
      ).status(),
    ).toBe(403);
    const restored = await context.request.post("/api/auth/restore", {
      headers,
      data: {},
    });
    expect(restored.status()).toBe(200);
    expect((await restored.json()).session.access_token).toBe(access.value);
    const rotated = await context.request.post("/api/auth/refresh", {
      headers,
      data: {},
    });
    expect(rotated.status()).toBe(200);
    const next = (await rotated.json()).session;
    expect(next.refresh_token).toBe("");
    expect(next.access_token).not.toBe(access.value);
    const nextRefresh = (await context.cookies()).find(
      (cookie) => cookie.name === "horizon_local_refresh",
    )!;
    expect(nextRefresh.value).not.toBe(refresh.value);
    // The stolen old refresh token invalidates the whole family when replayed.
    expect(
      (
        await request.post("/api/auth/refresh", {
          data: { refresh_token: refresh.value },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await request.get("/api/auth/me", {
          headers: { authorization: `Bearer ${next.access_token}` },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await request.post("/api/auth/refresh", {
          data: { refresh_token: nextRefresh.value },
        })
      ).status(),
    ).toBe(401);
    await context.request.post("/api/auth/session", {
      headers,
      data: { email, password },
    });
    const logoutRefresh = (await context.cookies()).find(
      (cookie) => cookie.name === "horizon_local_refresh",
    )!;
    expect(
      (
        await context.request.post("/api/auth/logout", { headers, data: {} })
      ).status(),
    ).toBe(200);
    expect(
      (await context.cookies()).filter((cookie) =>
        cookie.name.startsWith("horizon_local_"),
      ),
    ).toEqual([]);
    expect(
      (
        await request.post("/api/auth/refresh", {
          data: { refresh_token: logoutRefresh.value },
        })
      ).status(),
    ).toBe(401);
    const httpsLogin = await context.request.post("/api/auth/session", {
      headers: { ...headers, "x-forwarded-proto": "https" },
      data: { email, password },
    });
    expect(httpsLogin.status()).toBe(200);
    expect(httpsLogin.headers()["set-cookie"]).toContain("Secure");
  } finally {
    if (userId) await db.query("delete from users where id = $1", [userId]);
    await db.end();
  }
});

test("concurrent refresh redemption permits one rotation and revokes the family on replay; refresh expiry is enforced", async ({
  request,
}) => {
  const db = new Client({ connectionString: process.env.E2E_POSTGRES_URL });
  await db.connect();
  const email = `rotation-${randomUUID()}@test.invalid`;
  const password = "Security-password-93!";
  let userId: string | undefined;
  try {
    const registration = await request.post("/api/auth/register", {
      data: { email, password },
    });
    const initial = await registration.json();
    userId = initial.user.id;
    const refresh = (token: string) =>
      request.post("/api/auth/refresh", { data: { refresh_token: token } });
    const results = await Promise.all([
      refresh(initial.session.refresh_token),
      refresh(initial.session.refresh_token),
    ]);
    expect(results.map((result) => result.status()).sort()).toEqual([200, 401]);
    const winner = await results
      .find((result) => result.status() === 200)!
      .json();
    expect((await refresh(winner.session.refresh_token)).status()).toBe(401);
    expect(
      (
        await request.get("/api/auth/me", {
          headers: { authorization: `Bearer ${winner.session.access_token}` },
        })
      ).status(),
    ).toBe(401);
    const login = await request.post("/api/auth/session", {
      data: { email, password },
    });
    const fresh = await login.json();
    await db.query(
      "update private.refresh_tokens set expires_at = now() - interval '1 second' where token_hash = $1",
      [createHash("sha256").update(fresh.session.refresh_token).digest("hex")],
    );
    expect((await refresh(fresh.session.refresh_token)).status()).toBe(401);
    expect((await refresh("f".repeat(64))).status()).toBe(401);
  } finally {
    if (userId) await db.query("delete from users where id = $1", [userId]);
    await db.end();
  }
});
