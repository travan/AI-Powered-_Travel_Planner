// Operator export: only explicitly opted-in accounts, using the same filtered API projection.
// Build apps/server before running. Credentials are read locally and never printed.
import { createRequire } from "node:module";
import { readFile, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rootCertificates } from "node:tls";
import { createHmac, randomBytes, createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
);
const { Client } = require("pg"),
  dotenv = require("dotenv");
const arg = (key, fallback) => {
  const i = process.argv.indexOf(key);
  return i < 0 ? fallback : process.argv[i + 1];
};
const target = arg("--database", "local"),
  limit = Number(arg("--max-users", "1000"));
if (
  !["local", "cloud"].includes(target) ||
  !Number.isInteger(limit) ||
  limit < 1 ||
  limit > 10000
)
  throw new Error("Use --database local|cloud and --max-users 1..10000");
const output = path.resolve(
  root,
  arg("--output", ".training-data/planner-training.jsonl"),
);
const env = dotenv.parse(
  await readFile(
    path.join(root, target === "cloud" ? ".env.cloudflare.local" : ".env"),
    "utf8",
  ),
);
const connection =
  target === "cloud" ? env.SUPABASE_DATABASE_URL : env.POSTGRES_URL;
if (!connection) throw new Error("Database connection is not configured");
const ca =
  target === "cloud"
    ? await readFile(
        path.join(root, "apps/server/cloudflare/supabase-ca.crt"),
        "utf8",
      )
    : null;
const db = new Client({
  connectionString: connection,
  ssl: ca
    ? { ca: [...rootCertificates, ca], rejectUnauthorized: true }
    : undefined,
  connectionTimeoutMillis: 15000,
});
const tmp = output + `.tmp-${process.pid}`;
let handle;
try {
  await db.connect();
  await db.query("begin read only");
  if (target === "cloud")
    await db.query("set local search_path to travel_cloud,extensions,public");
  const { PlannerLearningService } =
    await import("../apps/server/dist/modules/itinerary/learning/learning.service.js");
  const service = new PlannerLearningService(db);
  const users = await db.query(
    "select user_id::text from planner_learning_settings where training_consent=true order by user_id limit $1",
    [limit],
  );
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  handle = await open(tmp, "wx", 0o600);
  const salt = randomBytes(32),
    hash = createHash("sha256");
  let records = 0,
    contributors = 0;
  for (const row of users.rows) {
    let examples;
    try {
      examples = await service.dataset(row.user_id);
    } catch (error) {
      if (error?.response?.code === "TRAINING_CONSENT_REQUIRED") continue;
      throw error;
    }
    if (examples.length) contributors++;
    const group = createHmac("sha256", salt).update(row.user_id).digest("hex");
    for (const example of examples) {
      const line =
        JSON.stringify({ ...example, anonymous_group: group }) + "\n";
      await handle.write(line);
      hash.update(line);
      records++;
    }
  }
  await handle.close();
  handle = null;
  await db.query("rollback");
  await rename(tmp, output);
  const manifest = {
    schema_version: 1,
    created_at: new Date().toISOString(),
    target,
    consented_accounts_scanned: users.rows.length,
    contributors,
    records,
    sha256: hash.digest("hex"),
    scope: "reviewed structural itineraries and approved spending statistics",
    model_retrained: false,
  };
  await writeFile(
    output + ".manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ status: "ok", ...manifest, output }));
} catch (error) {
  await handle?.close().catch(() => {});
  await rm(tmp, { force: true });
  await db.query("rollback").catch(() => {});
  console.error(
    JSON.stringify({ status: "failed", code: error.code ?? "EXPORT_FAILED" }),
  );
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
}
