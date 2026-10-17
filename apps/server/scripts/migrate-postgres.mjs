import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Share this runner between local bootstrap and Docker. Existing installations
// safely replay the legacy idempotent migrations once to establish the ledger.
export async function migratePostgres(
  client,
  directory = new URL("../src/database/migrations/", import.meta.url),
) {
  await client.query("select pg_advisory_lock(781247193)");
  try {
    await client.query(`create table if not exists schema_migrations (
      name text primary key, checksum text not null, applied_at timestamptz not null default now()
    )`);
    const files = (await readdir(directory))
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .sort();
    for (const name of files) {
      const source = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const applied = await client.query(
        "select checksum from schema_migrations where name = $1",
        [name],
      );
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query("begin");
      try {
        // Legacy files contain their own outer transaction. The runner owns it
        // so the schema change and ledger entry commit atomically.
        await client.query(
          source.replace(/^\s*begin;\s*/i, "").replace(/\s*commit;\s*$/i, ""),
        );
        await client.query(
          "insert into schema_migrations (name, checksum) values ($1, $2)",
          [name, checksum],
        );
        await client.query("commit");
        console.log(`Applied migration: ${name}`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Failed to apply migration ${name}: ${error.message}`, {
          cause: error,
        });
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock(781247193)");
  }
}
