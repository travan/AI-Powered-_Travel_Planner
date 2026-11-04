import pg from "pg";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "../../..");
const envPath = resolve(projectRoot, ".env");
if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

const { Client } = pg;
const postgresUrls = unique([
  process.env.POSTGRES_URL,
  process.env.DATABASE_URL,
  ...splitCsv(process.env.POSTGRES_URLS),
  ...splitCsv(process.env.DATABASE_URLS),
]);

if (postgresUrls.length === 0) {
  console.error("POSTGRES_URL, DATABASE_URL, POSTGRES_URLS, or DATABASE_URLS is required before seeding Vietnam cities.");
  process.exit(1);
}

import { cities, catalogVersion } from "./vietnam-city-catalog.mjs";
let lastError;
for (const postgresUrl of postgresUrls) {
  try {
    await seedPostgres(postgresUrl);
    process.exit(0);
  } catch (error) {
    lastError = error;
    console.warn("Vietnam city seed failed for one configured PostgreSQL URL, trying next fallback if available.");
  }
}

throw lastError;

async function seedPostgres(postgresUrl) {
  const client = new Client({ connectionString: postgresUrl });

  try {
    await client.connect();

    await client.query("begin");
    const schema = process.env.CATALOG_SCHEMA || "public";
    if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("Invalid catalog schema");
    await client.query(`set local search_path to ${schema}, extensions, public`);
    let upsertedOrUpdated = 0;

    for (const doc of cities) {
      const result = await client.query(
        `insert into cities (
           slug, name, country, timezone, currency, lat, lon, popular,
           cover_image, scraper_sources, region, tags, aliases, search_text, created_at, updated_at
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, null, $9, $10, $11, $12, $13, now(), now())
         on conflict (slug) do update set
           name = excluded.name,
           country = excluded.country,
           timezone = excluded.timezone,
           currency = excluded.currency,
           lat = excluded.lat,
           lon = excluded.lon,
           popular = excluded.popular,
           scraper_sources = excluded.scraper_sources,
           region = excluded.region,
           tags = excluded.tags,
           aliases = array(select distinct value from unnest(cities.aliases || excluded.aliases) value order by value),
           search_text = excluded.search_text,
           updated_at = now()`,
        [
          doc.slug,
          doc.name,
          doc.country,
          doc.timezone,
          doc.currency,
          doc.lat,
          doc.lon,
          doc.popular,
          doc.scraper_sources,
          doc.region,
          doc.tags,
          doc.aliases,
          buildSearchText(doc),
        ]
      );
      upsertedOrUpdated += result.rowCount ?? 0;
    }

    await client.query(`insert into catalog_versions(name, version) values ('vietnam-cities', $1)
      on conflict(name) do update set version=excluded.version, updated_at=now()`, [catalogVersion]);
    await client.query("commit");
    const total = await client.query("select count(*)::int as count from cities where country = 'VN'");
    console.info(
      JSON.stringify(
        {
          status: "ok",
          database: "postgres",
          seeded: cities.length,
          upserted_or_updated: upsertedOrUpdated,
          vietnam_city_count: total.rows[0]?.count ?? 0,
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

function buildSearchText(doc) {
  return [
    doc.slug,
    doc.name.en,
    doc.name.vi,
    doc.region,
    ...(doc.tags ?? []),
    ...(doc.aliases ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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
