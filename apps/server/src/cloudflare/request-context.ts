import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool } from "pg";

export type WorkersAI = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

export const workerRequestContext = new AsyncLocalStorage<{
  pool: Pool;
  ai?: WorkersAI;
  rawAi?: WorkersAI;
  queue?: { send(body: { jobId: string }): Promise<unknown> };
  rateLimitedAtEdge?: boolean;
}>();

// Connections belong to the current Worker invocation, never to a warm isolate.
export const workerPool = {
  query: (...args: unknown[]) => {
    const pool = workerRequestContext.getStore()?.pool;
    if (!pool)
      throw new Error("Database access requires a Worker request context");
    return (pool.query as (...args: unknown[]) => unknown)(...args);
  },
  connect: () => {
    const pool = workerRequestContext.getStore()?.pool;
    if (!pool)
      throw new Error("Database access requires a Worker request context");
    return pool.connect();
  },
  end: async () => {},
} as unknown as Pool;
