import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;

const postgresUrls = unique([
  process.env.POSTGRES_URL,
  process.env.DATABASE_URL,
  ...splitCsv(process.env.POSTGRES_URLS),
  ...splitCsv(process.env.DATABASE_URLS),
]);

if (postgresUrls.length === 0) {
  console.error("POSTGRES_URL, DATABASE_URL, POSTGRES_URLS, or DATABASE_URLS is required before running db:local:init.");
  process.exit(1);
}

let lastError;
for (const postgresUrl of postgresUrls) {
  try {
    await initPostgres(postgresUrl);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn(`PostgreSQL init failed for one configured URL, trying next fallback if available.`);
  }
}

throw lastError;

async function initPostgres(postgresUrl) {
const targetUrl = new URL(postgresUrl);
const databaseName = targetUrl.pathname.replace(/^\//, "") || "travel_planner";
const adminUrl = new URL(postgresUrl);
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

await adminClient.end();

const appClient = new Client({ connectionString: postgresUrl });
await appClient.connect();

const schemaSql = await readFile(new URL("../db/local-postgres.sql", import.meta.url), "utf8");
await appClient.query(schemaSql);
const workspaceMigrationFiles = [
  "006_local_workspace_core_compat.sql",
];

const localCompatibilityMigrationFiles = [
  "20260922_trip_schedule_compatibility.sql",
  "20260924_server_workspace_compatibility.sql",
];

for (const migrationFile of workspaceMigrationFiles) {
  const migrationSql = await readFile(
    new URL(`../../server/src/database/migrations/${migrationFile}`, import.meta.url),
    "utf8"
  );
  await appClient.query(migrationSql);
}

for (const migrationFile of localCompatibilityMigrationFiles) {
  const migrationSql = await readFile(
    new URL(`../db/migrations/${migrationFile}`, import.meta.url),
    "utf8"
  );
  await appClient.query(migrationSql);
}
await appClient.end();

console.log(`Local PostgreSQL schema is ready: ${databaseName}`);
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function splitCsv(value) {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
