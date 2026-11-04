import { migratePostgres } from "../apps/server/scripts/migrate-postgres.mjs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { rootCertificates } from "node:tls";

const require = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
);
const { Client } = require("pg");
const dotenv = require("dotenv");
const root = new URL("../", import.meta.url);
const envFile = new URL(".env.cloudflare.local", root);
// CI receives only database credentials, never reads/writes the local secret file
// and cannot create or rotate runtime credentials.
const ci = process.argv.includes("--ci");
const originalEnv = ci ? "" : await fs.readFile(envFile, "utf8");
const env = ci ? process.env : dotenv.parse(originalEnv);
if (!env.SUPABASE_DATABASE_URL) {
  throw new Error("Database migration requires SUPABASE_DATABASE_URL");
}
const adminUrl = new URL(env.SUPABASE_DATABASE_URL);
const isDirect = adminUrl.hostname === "db.cvlvzfkoarlwhvjwwppn.supabase.co";
const isSessionPooler =
  adminUrl.hostname.endsWith(".pooler.supabase.com") &&
  decodeURIComponent(adminUrl.username) === "postgres.cvlvzfkoarlwhvjwwppn" &&
  adminUrl.port === "5432";
if (!isDirect && !isSessionPooler) {
  throw new Error(
    "Refusing to initialize a database outside the selected Travel Planner Supabase project",
  );
}
const ca = await fs.readFile(
  new URL("apps/server/cloudflare/supabase-ca.crt", root),
  "utf8",
);
const client = new Client({
  connectionString: adminUrl.toString(),
  ssl: {
    ca: isSessionPooler ? [...rootCertificates, ca] : ca,
    rejectUnauthorized: true,
  },
  connectionTimeoutMillis: 15000,
});
const role = "travel_worker_app";
const password = ci
  ? null
  : env.POSTGRES_URL
    ? decodeURIComponent(new URL(env.POSTGRES_URL).password)
    : randomBytes(32).toString("hex");
const apply = process.argv.includes("--apply");
await client.connect();
try {
  await client.query("begin");
  await client.query(
    "select pg_advisory_xact_lock(hashtext('travel-cloud-bootstrap'))",
  );
  await client.query("create schema if not exists travel_cloud");
  await client.query(
    "set local search_path to travel_cloud, extensions, public",
  );
  const roleExists = await client.query(
    "select 1 from pg_roles where rolname = $1",
    [role],
  );
  if (!roleExists.rowCount) {
    if (ci)
      throw new Error(
        "Initialize the runtime role locally before enabling CI deployment",
      );
    // Only generated hexadecimal passwords are used in this DDL literal.
    if (!/^[a-f0-9]{64}$/.test(password))
      throw new Error("Expected generated runtime password");
    await client.query(
      `create role ${role} login password '${password}' nosuperuser nocreatedb nocreaterole noinherit`,
    );
  } else if (!ci && !env.POSTGRES_URL) {
    throw new Error(
      "Runtime role already exists but its local credentials are missing; refusing to rotate it",
    );
  }
  await migratePostgres(client, undefined, { schema: "travel_cloud", outerTransaction: true });
  await client.query(`create table if not exists travel_cloud.user_prompt_history (
    id uuid primary key default gen_random_uuid(), user_id uuid not null references travel_cloud.users(id) on delete cascade,
    prompt_text text not null default '', normalized_query jsonb not null default '{}', created_at timestamptz not null default now());
    create index if not exists user_prompt_history_user_created_idx on travel_cloud.user_prompt_history(user_id, created_at desc);
    create table if not exists travel_cloud.bill_ocr_documents (
    id uuid primary key default gen_random_uuid(), bill_id uuid not null references travel_cloud.bill_uploads(id) on delete cascade,
    trip_id uuid not null references travel_cloud.trips(id) on delete cascade,
    actor_user_id uuid not null references travel_cloud.users(id), raw_text text, parsed jsonb not null,
    created_at timestamptz not null default now());`);
  await client.query(`revoke all on schema travel_cloud from public, anon, authenticated;
    grant usage on schema travel_cloud, extensions to ${role};
    grant select, insert, update, delete on all tables in schema travel_cloud to ${role};
    revoke all on travel_cloud.schema_migrations from ${role};
    grant usage, select on all sequences in schema travel_cloud to ${role};
    grant usage on schema journey_internal to ${role};
    grant execute on all functions in schema journey_internal to ${role};
    grant usage on schema private to ${role};
    grant select, insert, update, delete on private.password_resets to ${role};
    grant select, insert, update, delete on private.refresh_tokens to ${role};
    alter role ${role} set search_path to travel_cloud, extensions, public;`);
  const tables = await client.query(
    "select tablename from pg_tables where schemaname='travel_cloud' and tablename <> 'schema_migrations'",
  );
  for (const { tablename } of tables.rows) {
    if (!/^[a-z_]+$/.test(tablename)) throw new Error("Unexpected table name");
    await client.query(
      `alter table travel_cloud.${tablename} enable row level security`,
    );
    const policy = await client.query(
      "select 1 from pg_policies where schemaname='travel_cloud' and tablename=$1 and policyname='backend_access'",
      [tablename],
    );
    if (!policy.rowCount)
      await client.query(
        `create policy backend_access on travel_cloud.${tablename} to ${role} using(true) with check(true)`,
      );
  }
  await client.query(
    "alter table private.password_resets enable row level security",
  );
  const resetPolicy = await client.query(
    "select 1 from pg_policies where schemaname='private' and tablename='password_resets' and policyname='travel_backend_access'",
  );
  if (!resetPolicy.rowCount)
    await client.query(
      `create policy travel_backend_access on private.password_resets to ${role} using(true) with check(true)`,
    );
  // Verify the restricted backend role can access the durable job queue before
  // committing. CI never needs the runtime password or the Worker's JWT secret.
  const grants = await client.query(
    `select has_table_privilege($1, 'travel_cloud.itinerary_jobs', 'SELECT')
      and has_table_privilege($1, 'travel_cloud.itinerary_jobs', 'INSERT')
      and has_table_privilege($1, 'travel_cloud.itinerary_jobs', 'UPDATE')
      and has_table_privilege($1, 'travel_cloud.itinerary_jobs', 'DELETE') as ready`,
    [role],
  );
  if (!grants.rows[0]?.ready)
    throw new Error("Runtime job queue grants are missing");
  await client.query(apply ? "commit" : "rollback");
  console.log(
    `${apply ? "Initialized" : "Dry run passed; rolled back"}: ${tables.rowCount} isolated application tables`,
  );
  if (apply && !ci) {
    const runtimeUrl = new URL(env.POSTGRES_URL || adminUrl);
    runtimeUrl.username = runtimeUrl.hostname.endsWith(".pooler.supabase.com")
      ? `${role}.cvlvzfkoarlwhvjwwppn`
      : role;
    runtimeUrl.password = password;
    runtimeUrl.search = "";
    const updates = {
      POSTGRES_URL: runtimeUrl.toString(),
      JWT_SECRET: env.JWT_SECRET || randomBytes(48).toString("hex"),
    };
    let saved = originalEnv;
    for (const [key, value] of Object.entries(updates)) {
      const line = `${key}=${JSON.stringify(value)}`;
      saved = new RegExp(`^${key}=.*$`, "m").test(saved)
        ? saved.replace(new RegExp(`^${key}=.*$`, "m"), line)
        : `${saved.trimEnd()}\n${line}\n`;
    }
    await fs.writeFile(envFile, saved, { mode: 0o600 });
    const verify = new Client({
      connectionString: runtimeUrl.toString(),
      ssl: { ca, rejectUnauthorized: true },
    });
    await verify.connect();
    try {
      const result = await verify.query(
        "select current_user as role, count(*)::int as users from users",
      );
      console.log(
        JSON.stringify({ runtimeConnectionVerified: true, ...result.rows[0] }),
      );
    } finally {
      await verify.end();
    }
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(
    `Cloud bootstrap failed (${error.code ?? "validation"}): ${error.message}`,
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
