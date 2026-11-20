import "../apps/server/node_modules/reflect-metadata/Reflect.js";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import { rootCertificates } from "node:tls";
import { GenerationStore } from "../apps/server/src/modules/itinerary/generation/generation.store.js";
import { recoverableSavedGeneration } from "../apps/server/src/modules/itinerary/generation/saved-generation.js";
import { PostgresSqlClient } from "../apps/server/src/database/postgres-sql.client.js";
// @ts-ignore: shared private-config loader
import { privateDeploymentConfig } from "./deployment-config.mjs";

const { Pool } = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
)("pg");
const deployment = await privateDeploymentConfig();
assert.ok(deployment, "Private deployment configuration required");
const ref = deployment.supabaseProjectRef;
const url = new URL(process.env.POSTGRES_URL ?? "");
assert.ok(
  url.hostname === `db.${ref}.supabase.co` ||
    (url.hostname.endsWith(".pooler.supabase.com") &&
      decodeURIComponent(url.username).endsWith(`.${ref}`)),
  "Runtime connection must belong to the privately selected project",
);
if (
  url.hostname === `db.${ref}.supabase.co` &&
  process.env.SUPABASE_DATABASE_URL
) {
  const pooler = new URL(process.env.SUPABASE_DATABASE_URL);
  assert.ok(
    pooler.hostname.endsWith(".pooler.supabase.com") &&
      pooler.port === "5432" &&
      decodeURIComponent(pooler.username) === `postgres.${ref}`,
    "Use the selected project's session pooler",
  );
  url.hostname = pooler.hostname;
  url.port = pooler.port;
  url.username = `${decodeURIComponent(url.username)}.${ref}`;
}
url.searchParams.delete("sslmode");
const ca = await fs.readFile(
  new URL("../apps/server/cloudflare/supabase-ca.crt", import.meta.url),
  "utf8",
);
const pool = new Pool({
  connectionString: url.href,
  ssl: { ca: [...rootCertificates, ca], rejectUnauthorized: true },
  options: "-c search_path=travel_cloud,extensions,public",
  max: 2,
  connectionTimeoutMillis: 15000,
});
try {
  const rows = (
    await pool.query(`select j.id,j.user_id,g.checkpoint,a.response
    from itinerary_jobs j join planning_generations g on g.id=j.generation_id
    join planning_generation_ai a on a.generation_id=g.id
    where j.status='failed' and j.kind='generate' and j.pipeline_version=2 and a.state='received'
      and g.checkpoint->>'display_recovery_version' is distinct from '1'`)
  ).rows;
  const eligible = rows.filter(
    (row: { checkpoint: unknown; response: unknown }) =>
      recoverableSavedGeneration(row.checkpoint, row.response),
  );
  let recovered = 0;
  if (process.argv.includes("--apply")) {
    const store = new GenerationStore(pool, new PostgresSqlClient(pool));
    for (const user of new Set<string>(
      eligible.map((row: { user_id: string }) => row.user_id),
    ))
      recovered += (await store.recoverReceived(user)).length;
  }
  console.log(
    JSON.stringify({
      mode: process.argv.includes("--apply") ? "apply" : "read-only",
      candidates: rows.length,
      eligible: eligible.length,
      recovered,
      aiCalls: 0,
      credentialsOrContentExported: false,
    }),
  );
} finally {
  await pool.end();
}
