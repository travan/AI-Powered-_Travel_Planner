import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { workerPool, workerRequestContext } from "../../../../../apps/server/src/cloudflare/request-context";

describe("Worker database scope", () => {
  it("never allows database access without an invocation", () => {
    expect(() => workerPool.query("select 1")).toThrow("request context");
  });

  it("keeps concurrent invocations on their own pool and preserves method context", async () => {
    const ai = { run: async () => ({}) };
    function pool(name: string) {
      return { name, async query() { await Promise.resolve(); return { rows: [{ name: this.name }] }; } } as unknown as Pool;
    }
    const results = await Promise.all(["first", "second"].map(name =>
      workerRequestContext.run({ pool: pool(name), ai }, async () => {
        await Promise.resolve();
        return workerPool.query("select current_user");
      })));
    expect(results.map(result => result.rows[0].name)).toEqual(["first", "second"]);
    expect(() => workerPool.query("select 1")).toThrow("request context");
  });
});
