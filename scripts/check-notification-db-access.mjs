import { createRequire } from "node:module";
import { migratePostgres } from "../apps/server/scripts/migrate-postgres.mjs";

const { Client } = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
)("pg");
const url = new URL(process.env.POSTGRES_ADMIN_URL ?? "");
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Local database required.");
const setup = new Client({ connectionString: url.toString() });
await setup.connect();
const local = new URL(process.env.POSTGRES_URL);
if (
  local.hostname !== url.hostname ||
  local.port !== url.port ||
  !local.pathname.endsWith("_test")
)
  throw new Error("Use the isolated test database on the same local server.");
const cloud = new URL(url);
cloud.pathname = "/cohorizon_cloud_security_test";
let cloudCreated = false;
const generationTables = [
  "planning_generations",
  "planning_generation_ai",
  "planning_admission_capacity",
  "planning_ai_slots",
  "planning_submission_keys",
];
try {
  await setup.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='travel_worker_app') then create role travel_worker_app nologin; end if;
  end $$`);
  await setup.query("create database cohorizon_cloud_security_test");
  cloudCreated = true;
  for (const [connection, schema, role] of [
    [local, "public", "travel_e2e"],
    [cloud, "travel_cloud", "travel_worker_app"],
  ]) {
    const admin = new URL(url);
    admin.pathname = connection.pathname;
    const db = new Client({ connectionString: admin.toString() });
    await db.connect();
    try {
      if (schema === "travel_cloud") {
        await db.query(
          "create schema travel_cloud; set search_path to travel_cloud,public",
        );
        await migratePostgres(db, undefined, { schema });
        await db.query(`grant usage on schema travel_cloud,journey_internal to travel_worker_app;
          grant select,insert,update,delete on all tables in schema travel_cloud to travel_worker_app;
          grant execute on all functions in schema journey_internal to travel_worker_app;`);
        for (const table of [
          "product_notifications",
          "itinerary_jobs",
          "journey_job_dispatch",
          ...generationTables,
        ])
          await db.query(
            `create policy backend_access on travel_cloud.${table} to travel_worker_app using (true) with check (true)`,
          );
      }
      for (const browserRole of ["anon", "authenticated"]) {
        for (const table of [
          "product_notifications",
          "journey_job_dispatch",
          ...generationTables,
        ]) {
          const {
            rows: [result],
          } = await db.query(
            "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as allowed",
            [browserRole, `${schema}.${table}`],
          );
          if (result.allowed)
            throw new Error(`${browserRole} can access ${schema}.${table}`);
        }
      }
      await db.query("begin");
      try {
        const {
          rows: [user],
        } = await db.query(
          `insert into ${schema}.users(email,password_hash) values('db-role@test.invalid','fixture') returning id`,
        );
        await db.query(`set local role ${role}`);
        const {
          rows: [job],
        } = await db.query(
          `insert into ${schema}.itinerary_jobs(user_id,payload) values($1,'{}') returning id`,
          [user.id],
        );
        const {
          rows: [notification],
        } = await db.query(
          `select event from ${schema}.product_notifications where subject_id=$1`,
          [job.id],
        );
        if (notification?.event !== "queued")
          throw new Error("Runtime role failed to record the job event.");
      } finally {
        await db.query("rollback");
      }
      console.log(`${schema}: role boundaries passed`);
    } finally {
      await db.end();
    }
  }
} finally {
  if (cloudCreated)
    await setup.query("drop database cohorizon_cloud_security_test");
  await setup.end();
}
