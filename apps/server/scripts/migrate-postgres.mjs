import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Share this runner between local bootstrap and Docker. Existing installations
// safely replay the legacy idempotent migrations once to establish the ledger.
export async function migratePostgres(
  client,
  directory = new URL("../src/database/migrations/", import.meta.url),
  { schema = "public", outerTransaction = false } = {},
) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema))
    throw new Error("Invalid migration schema");
  const table =
    schema === "public" ? "schema_migrations" : `${schema}.schema_migrations`;
  await client.query(
    outerTransaction
      ? "select pg_advisory_xact_lock(781247193)"
      : "select pg_advisory_lock(781247193)",
  );
  try {
    await client.query(`create table if not exists ${table} (
      name text primary key, checksum text not null, applied_at timestamptz not null default now()
    )`);
    await client.query(
      `alter table ${table} add column if not exists checksum text`,
    );
    const files = (await readdir(directory))
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .sort();
    for (const name of files) {
      const source = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const applied = await client.query(
        `select checksum from ${table} where name = $1`,
        [name],
      );
      if (applied.rows.length) {
        // Pre-checksum cloud history is adopted once; existing versions are not replayed.
        if (applied.rows[0].checksum == null) {
          await client.query(
            `update ${table} set checksum=$2 where name=$1 and checksum is null`,
            [name, checksum],
          );
          console.log(`Adopted legacy migration checksum: ${name}`);
          continue;
        }
        if (applied.rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      if (!outerTransaction) await client.query("begin");
      try {
        // Legacy files contain their own outer transaction. The runner owns it
        // so the schema change and ledger entry commit atomically.
        await client.query(
          source
            .replace(/\bpublic\./g, `${schema}.`)
            .replace(/^\s*(begin|commit);\s*$/gim, "")
            .trim(),
        );
        await client.query(
          `insert into ${table} (name, checksum) values ($1, $2)`,
          [name, checksum],
        );
        if (!outerTransaction) await client.query("commit");
        console.log(`Applied migration: ${name}`);
      } catch (error) {
        if (!outerTransaction) await client.query("rollback");
        throw new Error(`Failed to apply migration ${name}: ${error.message}`, {
          cause: error,
        });
      }
    }
  } finally {
    if (!outerTransaction)
      await client.query("select pg_advisory_unlock(781247193)");
  }
}
