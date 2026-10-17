import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { migratePostgres } from "../../../../../apps/server/scripts/migrate-postgres.mjs";

async function fixture(run: (url: URL) => Promise<void>) {
  const dir = await mkdtemp(`${tmpdir()}/travel-migrations-`);
  try {
    await writeFile(`${dir}/002_next.sql`, "begin;\nselect 2;\ncommit;");
    await writeFile(`${dir}/001_first.sql`, "select 1;");
    await run(pathToFileURL(`${dir}/`));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("migration runner", () => {
  it("orders migrations, records them atomically and skips applied versions", async () =>
    fixture(async (directory) => {
      const ledger = new Map();
      const query = vi.fn(async (sql, params) => {
        if (sql.startsWith("select checksum"))
          return {
            rows: ledger.has(params[0])
              ? [{ checksum: ledger.get(params[0]) }]
              : [],
          };
        if (sql.startsWith("insert into schema_migrations"))
          ledger.set(params[0], params[1]);
        return { rows: [] };
      });
      await migratePostgres({ query }, directory);
      expect([...ledger.keys()]).toEqual(["001_first.sql", "002_next.sql"]);
      expect(query.mock.calls.map((c) => c[0])).toContain("select 2;");
      query.mockClear();
      await migratePostgres({ query }, directory);
      expect(query.mock.calls.map((c) => c[0])).not.toContain("begin");
      await writeFile(new URL("001_first.sql", directory), "select 3;");
      await expect(migratePostgres({ query }, directory)).rejects.toThrow(
        "Applied migration changed",
      );
      expect(query).toHaveBeenLastCalledWith(
        "select pg_advisory_unlock(781247193)",
      );
    }));

  it("rolls back, stops and releases the lock on failure", async () =>
    fixture(async (directory) => {
      const query = vi.fn(async (sql) => {
        if (sql === "select 1;") throw new Error("broken schema");
        return { rows: [] };
      });
      await expect(migratePostgres({ query }, directory)).rejects.toThrow(
        "001_first.sql: broken schema",
      );
      expect(query.mock.calls.map((c) => c[0])).toContain("rollback");
      expect(query.mock.calls.map((c) => c[0])).not.toContain("select 2;");
      expect(query).toHaveBeenLastCalledWith(
        "select pg_advisory_unlock(781247193)",
      );
    }));
});
