// CI/isolated tests only: create two disposable databases and compare migrated schemas.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { migratePostgres } from "../apps/server/scripts/migrate-postgres.mjs";
import { audit, logicalSnapshot } from "./audit-travel-databases.mjs";
const require = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
);
const { Client } = require("pg");
const url = process.env.PARITY_POSTGRES_URL;
if (
  !url ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
  !/test|e2e/.test(new URL(url).pathname)
)
  throw new Error(
    "PARITY_POSTGRES_URL must be an isolated local test database",
  );
const admin = new Client({ connectionString: url });
await admin.connect();
const names = ["travel_parity_local_test", "travel_parity_cloud_test"];
const results = [];
const created = [];
try {
  for (const [index, name] of names.entries()) {
    // Refuse existing databases; never destroy someone else's test state.
    if (
      (await admin.query("select 1 from pg_database where datname=$1", [name]))
        .rowCount
    )
      throw new Error("Disposable parity database already exists");
    await admin.query(`create database ${name}`);
    created.push(name);
    const target = new URL(url);
    target.pathname = `/${name}`;
    const client = new Client({ connectionString: target.toString() });
    await client.connect();
    try {
      const schema = index ? "travel_cloud" : "public";
      if (index) await client.query("create schema travel_cloud");
      await client.query(`set search_path to ${schema},public`);
      await migratePostgres(client, undefined, { schema });
      await migratePostgres(client, undefined, { schema });
      // Exercise upgrading referenced duplicate cities, and atomic rollback on conflicts.
      await client.query(
        `insert into cities(slug,name,country,timezone,currency,lat,lon) values('legacy-hanoi','{"en":"Hanoi","vi":"Hà Nội"}','','','',null,null)`,
      );
      await client.query(
        `create table city_reference_test(city_slug text primary key references cities(slug))`,
      );
      await client.query(
        `insert into city_reference_test values('legacy-hanoi')`,
      );
      const folder = new URL(
        "../apps/server/src/database/migrations/",
        import.meta.url,
      );
      const filename = (await readdir(folder)).find((n) =>
        n.endsWith("_city_alias_reconciliation.sql"),
      );
      const repair = (
        await readFile(new URL(filename, folder), "utf8")
      ).replace(/\bpublic\./g, `${schema}.`);
      await client.query(repair);
      assert.equal(
        (await client.query("select city_slug from city_reference_test"))
          .rows[0].city_slug,
        "ha-noi",
      );
      assert.equal(
        (
          await client.query(
            "select status from city_reconciliation_report where original_slug='legacy-hanoi'",
          )
        ).rows[0].status,
        "merged",
      );
      await client.query(
        `insert into cities(slug,name,country,timezone,currency,lat,lon) values('conflicting-hanoi','{"en":"Hanoi","vi":"Hà Nội"}','','','',null,null)`,
      );
      await client.query(
        `insert into city_reference_test values('conflicting-hanoi')`,
      );
      await client.query(repair);
      assert.equal(
        (
          await client.query(
            "select status from city_reconciliation_report where original_slug='conflicting-hanoi'",
          )
        ).rows[0].status,
        "conflict",
      );
      assert.equal(
        (
          await client.query(
            "select count(*)::int as n from city_reference_test",
          )
        ).rows[0].n,
        2,
      );
      await client.query(
        `insert into cities(slug,name,country,timezone,currency,lat,lon) values('legacy-bac-kinh','{"en":"Bắc Kinh","vi":"Bắc Kinh"}','','','',null,null)`,
      );
      await client.query(
        "insert into city_reference_test values('legacy-bac-kinh')",
      );
      const bilingualFile = (await readdir(folder)).find((n) =>
        n.endsWith("_bilingual_city_reference_merge.sql"),
      );
      await client.query(
        (await readFile(new URL(bilingualFile, folder), "utf8")).replace(
          /\bpublic\./g,
          `${schema}.`,
        ),
      );
      assert.equal(
        (
          await client.query(
            "select count(*)::int as n from city_reference_test where city_slug='beijing'",
          )
        ).rows[0].n,
        1,
      );
      await client.query("drop table city_reference_test");
      await client.query("delete from cities where slug='conflicting-hanoi'");
      results.push(await audit(client, schema));
    } finally {
      await client.end();
    }
  }
  const equal = logicalSnapshot(results[0]) === logicalSnapshot(results[1]);
  if (!equal) {
    const keys = [
      "columns",
      "constraints",
      "indexes",
      "migrations",
      "catalog_versions",
    ];
    for (const key of keys)
      if (
        logicalSnapshot({ ...results[0], [key]: [] }) ===
        logicalSnapshot({ ...results[1], [key]: [] })
      )
        console.error(`Mismatch: ${key}`);
    throw new Error("Logical database schemas differ");
  }
  console.log(
    "Schema, migration checksums and catalog versions match for local and cloud schemas.",
  );
} finally {
  // Only drop databases created by this invocation.
  for (const name of created) await admin.query(`drop database ${name}`);
  await admin.end();
}
