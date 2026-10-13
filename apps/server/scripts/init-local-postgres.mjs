import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;

if (process.env.DATABASE_PROVIDER === "supabase") {
  throw new Error("db:local:init only initializes a local PostgreSQL database; DATABASE_PROVIDER=supabase is not supported.");
}

const postgresUrl = process.env.POSTGRES_URL?.trim();
if (!postgresUrl) {
  throw new Error("POSTGRES_URL is required before running db:local:init.");
}

await initPostgres(postgresUrl);

async function initPostgres(postgresUrl) {
const targetUrl = new URL(postgresUrl);
assertLocalHost(targetUrl, "POSTGRES_URL");
const databaseName = targetUrl.pathname.replace(/^\//, "") || "travel_planner";
const appUser = decodeURIComponent(targetUrl.username);
const appPassword = decodeURIComponent(targetUrl.password);
if (!appUser || !appPassword) {
  throw new Error("POSTGRES_URL must include the local application username and password.");
}

const adminUrl = resolveAdminUrl(targetUrl);
assertLocalHost(adminUrl, "POSTGRES_ADMIN_URL");
adminUrl.pathname = "/postgres";

const adminClient = new Client({ connectionString: adminUrl.toString() });
await adminClient.connect();

const exists = await adminClient.query(
  "select 1 from pg_database where datname = $1",
  [databaseName]
);

if (exists.rowCount === 0) {
  await adminClient.query(`create database ${quoteIdentifier(databaseName)}`);
  console.log(`Created local PostgreSQL database: ${databaseName}`);
}

const adminUser = decodeURIComponent(adminUrl.username);
if (appUser === adminUser) {
  await adminClient.end();
  throw new Error("POSTGRES_URL must use a dedicated application role, not the POSTGRES_ADMIN_URL role.");
}
await adminClient.query(
  `create role ${quoteIdentifier(appUser)} login password ${quoteLiteral(appPassword)} nosuperuser nocreatedb nocreaterole noinherit`,
).catch(async (error) => {
  if (error?.code !== "42710") throw error;
  await adminClient.query(
    `alter role ${quoteIdentifier(appUser)} with login password ${quoteLiteral(appPassword)} nosuperuser nocreatedb nocreaterole noinherit`,
  );
});

await adminClient.end();

const schemaAdminUrl = new URL(adminUrl);
schemaAdminUrl.pathname = `/${databaseName}`;
const schemaAdmin = new Client({ connectionString: schemaAdminUrl.toString() });
await schemaAdmin.connect();

const schemaSql = await readFile(new URL("../src/database/migrations/001_local_postgres.sql", import.meta.url), "utf8");
await schemaAdmin.query(schemaSql);
const migrationFiles = [
  "003_collaboration_finance.sql",
  "004_schedule_transport.sql",
  "005_review_ocr_recommendations.sql",
  "006_local_workspace_core_compat.sql",
  "007_repair_self_accepted_invites.sql",
  "008_trip_schedule_compatibility.sql",
  "009_server_workspace_compatibility.sql",
  "010_manual_city_catalog.sql",
  "011_ai_city_catalog_worker.sql",
];

for (const migrationFile of migrationFiles) {
  const migrationSql = await readFile(
    new URL(`../src/database/migrations/${migrationFile}`, import.meta.url),
    "utf8"
  );
  try {
    await schemaAdmin.query(migrationSql);
  } catch (error) {
    throw new Error(`Failed to apply local PostgreSQL migration ${migrationFile}: ${error.message}`, { cause: error });
  }
}

await grantApplicationRole(schemaAdmin, databaseName, appUser, adminUser);
await schemaAdmin.end();

const appClient = new Client({ connectionString: targetUrl.toString() });
await appClient.connect();
const identity = await appClient.query("select current_user as role, current_database() as database");
await appClient.end();

console.log(`Local PostgreSQL schema is ready: ${identity.rows[0].database} (role ${identity.rows[0].role}).`);
}

function resolveAdminUrl(targetUrl) {
  const configured = process.env.POSTGRES_ADMIN_URL?.trim();
  if (configured) return new URL(configured);

  const adminUrl = new URL(targetUrl);
  adminUrl.username = "postgres";
  adminUrl.password = "postgres";
  adminUrl.pathname = "/postgres";
  return adminUrl;
}

function assertLocalHost(url, variableName) {
  if (!["localhost", "127.0.0.1", "::1", "postgres"].includes(url.hostname)) {
    throw new Error(`${variableName} must point to localhost for db:local:init.`);
  }
}

async function grantApplicationRole(client, databaseName, appUser, adminUser) {
  const role = quoteIdentifier(appUser);
  const admin = quoteIdentifier(adminUser);
  await client.query(`grant connect on database ${quoteIdentifier(databaseName)} to ${role}`);
  await client.query(`grant usage on schema public to ${role}`);
  await client.query(`grant select, insert, update, delete on all tables in schema public to ${role}`);
  await client.query(`grant usage, select, update on all sequences in schema public to ${role}`);
  await client.query(`grant execute on all functions in schema public to ${role}`);
  await client.query(`alter default privileges for role ${admin} in schema public grant select, insert, update, delete on tables to ${role}`);
  await client.query(`alter default privileges for role ${admin} in schema public grant usage, select, update on sequences to ${role}`);
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
