import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const { Client } = createRequire(path.join(projectRoot, "apps/server/package.json"))("pg");
const localEnvPath = path.join(projectRoot, ".env");
if (existsSync(localEnvPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(localEnvPath);
}

const apiUrl = (process.env.LOCAL_REGRESSION_API_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const adminUrl = process.env.POSTGRES_ADMIN_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const parsedAdminUrl = new URL(adminUrl);
const databaseName = decodeURIComponent(new URL(process.env.POSTGRES_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/travel_planner").pathname.slice(1));
assert.ok(
  ["localhost", "127.0.0.1", "::1"].includes(parsedAdminUrl.hostname),
  "POSTGRES_ADMIN_URL must point to localhost for this regression check.",
);
parsedAdminUrl.pathname = `/${databaseName}`;

const email = `regression-${randomUUID()}@local.invalid`;
const password = `Regression-${randomUUID()}-9x!`;
let userId;

try {
  const registration = await request("/api/auth/register", {
    method: "POST",
    body: { email, password, full_name: "Local Regression" },
  });
  assert.ok(registration.response.ok, `signup failed: ${registration.response.status} ${JSON.stringify(registration.body)}`);
  const accessToken = registration.body?.session?.access_token;
  userId = registration.body?.user?.id;
  assert.equal(typeof accessToken, "string", "signup should return an access token");
  assert.equal(typeof userId, "string", "signup should return the created user");

  const me = await request("/api/auth/me", { token: accessToken });
  assert.equal(me.response.status, 200, "the new signup session should authorize /me");
  assert.equal(me.body?.user?.id, userId);

  const logout = await request("/api/auth/logout", { method: "POST", token: accessToken });
  assert.equal(logout.response.status, 200, "logout should revoke the active session");

  const revoked = await request("/api/auth/me", { token: accessToken });
  assert.equal(revoked.response.status, 401, "revoked sessions must no longer authorize /me");

  const login = await request("/api/auth/session", { method: "POST", body: { email, password } });
  assert.equal(login.response.status, 200, "the registered account should be able to log in");
  const loginToken = login.body?.session?.access_token;
  assert.equal(typeof loginToken, "string");

  const loggedInMe = await request("/api/auth/me", { token: loginToken });
  assert.equal(loggedInMe.response.status, 200, "a fresh login session should authorize /me");

  const finalLogout = await request("/api/auth/logout", { method: "POST", token: loginToken });
  assert.equal(finalLogout.response.status, 200);
  console.log("Local Postgres auth regression passed: signup, /me, logout, revocation, and login.");
} finally {
  if (userId) {
    const admin = new Client({ connectionString: parsedAdminUrl.toString() });
    await admin.connect();
    await admin.query("delete from public.users where id = $1", [userId]);
    await admin.end();
  }
}

async function request(endpoint, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${apiUrl}${endpoint}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body };
}
