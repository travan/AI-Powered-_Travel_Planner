import { migratePostgres } from "./migrate-postgres.mjs";
import pg from "pg";

const { Client } = pg;

if (process.env.DATABASE_PROVIDER === "supabase") {
  throw new Error(
    "db:local:init only initializes a local PostgreSQL database; DATABASE_PROVIDER=supabase is not supported.",
  );
}

const postgresUrl = process.env.POSTGRES_URL?.trim();
if (!postgresUrl) {
  throw new Error("POSTGRES_URL is required before running db:local:init.");
}

await initPostgres(postgresUrl);

async function initPostgres(postgresUrl) {
  const targetUrl = new URL(postgresUrl);
  assertLocalHost(targetUrl, "POSTGRES_URL");
  const databaseName =
    targetUrl.pathname.replace(/^\//, "") || "travel_planner";
  const appUser = decodeURIComponent(targetUrl.username);
  const appPassword = decodeURIComponent(targetUrl.password);
  if (!appUser || !appPassword) {
    throw new Error(
      "POSTGRES_URL must include the local application username and password.",
    );
  }

  const adminUrl = resolveAdminUrl(targetUrl);
  assertLocalHost(adminUrl, "POSTGRES_ADMIN_URL");
  adminUrl.pathname = "/postgres";

  const adminClient = new Client({ connectionString: adminUrl.toString() });
  await adminClient.connect();

  const exists = await adminClient.query(
    "select 1 from pg_database where datname = $1",
    [databaseName],
  );

  if (exists.rowCount === 0) {
    await adminClient.query(`create database ${quoteIdentifier(databaseName)}`);
    console.log(`Created local PostgreSQL database: ${databaseName}`);
  }

  const adminUser = decodeURIComponent(adminUrl.username);
  if (appUser === adminUser) {
    await adminClient.end();
    throw new Error(
      "POSTGRES_URL must use a dedicated application role, not the POSTGRES_ADMIN_URL role.",
    );
  }
  await adminClient
    .query(
      `create role ${quoteIdentifier(appUser)} login password ${quoteLiteral(appPassword)} nosuperuser nocreatedb nocreaterole noinherit`,
    )
    .catch(async (error) => {
      if (error?.code !== "42710") throw error;
      await adminClient.query(
        `alter role ${quoteIdentifier(appUser)} with login password ${quoteLiteral(appPassword)} nosuperuser nocreatedb nocreaterole noinherit`,
      );
    });

  await adminClient.end();

  const schemaAdminUrl = new URL(adminUrl);
  schemaAdminUrl.pathname = `/${databaseName}`;
  const schemaAdmin = new Client({
    connectionString: schemaAdminUrl.toString(),
  });
  await schemaAdmin.connect();

  try {
    await migratePostgres(schemaAdmin);
    await grantApplicationRole(schemaAdmin, databaseName, appUser, adminUser);
  } finally {
    await schemaAdmin.end();
  }

  const appClient = new Client({ connectionString: targetUrl.toString() });
  await appClient.connect();
  const identity = await appClient.query(
    "select current_user as role, current_database() as database",
  );
  await appClient.end();

  console.log(
    `Local PostgreSQL schema is ready: ${identity.rows[0].database} (role ${identity.rows[0].role}).`,
  );
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
    throw new Error(
      `${variableName} must point to localhost for db:local:init.`,
    );
  }
}

async function grantApplicationRole(client, databaseName, appUser, adminUser) {
  const role = quoteIdentifier(appUser);
  const admin = quoteIdentifier(adminUser);
  await client.query(
    `grant connect on database ${quoteIdentifier(databaseName)} to ${role}`,
  );
  await client.query(`grant usage on schema public to ${role}`);
  await client.query(`grant usage on schema private to ${role}`);
  await client.query(
    `grant select, insert, update, delete on private.password_resets to ${role}`,
  );
  await client.query(
    `grant select, insert, update, delete on private.refresh_tokens to ${role}`,
  );
  await client.query(
    `grant select, insert, update, delete on all tables in schema public to ${role}`,
  );
  await client.query(
    `grant usage, select, update on all sequences in schema public to ${role}`,
  );
  await client.query(
    `grant execute on all functions in schema public to ${role}`,
  );
  await client.query(`grant usage on schema journey_internal to ${role}`);
  await client.query(
    `grant execute on all functions in schema journey_internal to ${role}`,
  );
  // Browser roles receive no grants. The dedicated server role needs explicit
  // policies for server-only tables protected by RLS.
  for (const table of [
    "itinerary_jobs",
    "trip_plan_revisions",
    "accommodations",
    "user_prompt_history",
    "itinerary_translations",
  ]) {
    const relation = quoteIdentifier(table);
    const policy = quoteIdentifier(`backend_${appUser}`);
    await client.query(`drop policy if exists ${policy} on public.${relation}`);
    await client.query(
      `create policy ${policy} on public.${relation} to ${role} using (true) with check (true)`,
    );
  }
  await client.query(
    `alter default privileges for role ${admin} in schema public grant select, insert, update, delete on tables to ${role}`,
  );
  await client.query(
    `alter default privileges for role ${admin} in schema public grant usage, select, update on sequences to ${role}`,
  );
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
