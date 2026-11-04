import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../../apps/server/package.json", import.meta.url),
);
const { Pool } = require("pg");
const database = process.env.E2E_POSTGRES_URL;
if (
  !database ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname) ||
  !/test|e2e/.test(new URL(database).pathname)
)
  throw new Error("Isolated local test DB required");
const { GoogleAuthService, digest } =
  await import("../../apps/server/dist/modules/auth/application/google-auth.service.js");
const { PostgresUserRepository } =
  await import("../../apps/server/dist/modules/auth/infrastructure/postgres-user.repository.js");
const pool = new Pool({ connectionString: database });
const users = new PostgresUserRepository(pool, pool);
const service = new GoogleAuthService(pool, users);
const suffix = Date.now();
const txn = {
  nonce: "n",
  verifier: "v",
  intent: "signin",
  user_id: null,
  session_hash: null,
  next_path: "/plan",
};
const profile = {
  subject: `concurrent-${suffix}`,
  email: `concurrent-${suffix}@example.com`,
  fullName: "Test",
};
try {
  const outcomes = await Promise.all([
    service.resolveIdentity(profile, txn),
    service.resolveIdentity(profile, txn),
  ]);
  assert.equal(outcomes[0].id, outcomes[1].id);
  assert.equal(
    (
      await pool.query(
        "select count(*)::int as n from auth_identities where subject=$1",
        [profile.subject],
      )
    ).rows[0].n,
    1,
  );
  const race = await Promise.allSettled([
    service.resolveIdentity(
      {
        ...profile,
        subject: `a-${suffix}`,
        email: `race-${suffix}@example.com`,
      },
      txn,
    ),
    service.resolveIdentity(
      {
        ...profile,
        subject: `b-${suffix}`,
        email: `race-${suffix}@example.com`,
      },
      txn,
    ),
  ]);
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    race.find((x) => x.status === "rejected").reason.code,
    "google_link_required",
  );
  const local = await users.createLocalUser({
    email: `local-${suffix}@example.com`,
    password: "Test-password-93",
  });
  await assert.rejects(
    service.resolveIdentity(
      { ...profile, subject: `local-${suffix}`, email: local.email },
      txn,
    ),
    { code: "google_link_required" },
  );
  await users.createSession({
    userId: local.id,
    token: `token-${suffix}`,
    refreshToken: `refresh-${suffix}`,
  });
  const linkTxn = {
    ...txn,
    intent: "link",
    user_id: local.id,
    session_hash: digest(`token-${suffix}`),
  };
  const linked = await service.resolveIdentity(
    { ...profile, subject: `local-${suffix}`, email: local.email },
    linkTxn,
  );
  assert.equal(linked.id, local.id);
  await users.revokeSession(`token-${suffix}`);
  await assert.rejects(
    service.resolveIdentity(
      { ...profile, subject: `local-${suffix}`, email: local.email },
      linkTxn,
    ),
    { code: "google_link_mismatch" },
  );
  assert.equal(
    await users.verifyLocalCredentials({
      email: profile.email,
      password: "anything",
    }),
    null,
  );
  Object.assign(process.env, {
    GOOGLE_AUTH_ENABLED: "true",
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
    GOOGLE_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
    NODE_ENV: "test",
  });
  const began = await service.start({ intent: "signin" });
  const state = new URL(began.url).searchParams.get("state");
  await assert.rejects(
    service.finish({ state, browser: "wrong", error: "access_denied" }),
    { code: "google_invalid_state" },
  );
  await assert.rejects(
    service.finish({ state, browser: began.browser, error: "access_denied" }),
    { code: "google_cancelled" },
  );
  await assert.rejects(
    service.finish({ state, browser: began.browser, error: "access_denied" }),
    { code: "google_invalid_state" },
  );
  const expired = await service.start({ intent: "signin" });
  const expiredState = new URL(expired.url).searchParams.get("state");
  await pool.query(
    "update oauth_transactions set expires_at=now()-interval '1 second' where state_hash=$1",
    [digest(expiredState)],
  );
  await assert.rejects(
    service.finish({
      state: expiredState,
      browser: expired.browser,
      error: "access_denied",
    }),
    { code: "google_invalid_state" },
  );
  const rls = await pool.query(
    "select relname,relrowsecurity from pg_class where oid in ('auth_identities'::regclass,'oauth_transactions'::regclass)",
  );
  assert.ok(rls.rows.every((r) => r.relrowsecurity));
  console.log(
    "PASS: Google identity concurrency, explicit linking, null passwords, active-session enforcement, browser binding, replay, expiry and runtime RLS",
  );
} finally {
  await pool.end();
}
