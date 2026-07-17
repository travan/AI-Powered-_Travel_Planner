import pg, { type Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";
import { env } from "../env.js";

const { Pool: PgPool } = pg;

const pools = new Map<string, Pool>();
let activeUrlIndex = 0;

export function getPostgresPool(): Pool {
  return getPoolForUrl(getPostgresUrls()[activeUrlIndex]!);
}

function getPoolForUrl(connectionString: string): Pool {
  const existing = pools.get(connectionString);
  if (existing) return existing;

  const options: PoolConfig & {
    query_timeout?: number;
    statement_timeout?: number;
  } = {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: env.DB_CONNECT_TIMEOUT_MS,
    query_timeout: env.DB_QUERY_TIMEOUT_MS,
    statement_timeout: env.DB_QUERY_TIMEOUT_MS,
  };
  const nextPool = new PgPool(options);
  pools.set(connectionString, nextPool);
  return nextPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  const urls = getPostgresUrls();
  let lastError: unknown;

  for (let offset = 0; offset < urls.length; offset += 1) {
    const index = (activeUrlIndex + offset) % urls.length;
    const url = urls[index]!;

    try {
      const result = await getPoolForUrl(url).query<T>(text, values);
      activeUrlIndex = index;
      return result;
    } catch (error) {
      lastError = error;
      if (!isFailoverError(error) || urls.length === 1) {
        throw error;
      }

      await closePool(url);
      console.warn(`PostgreSQL connection failed, trying fallback ${offset + 1}/${urls.length - 1}`);
    }
  }

  throw lastError;
}

export async function withPostgresTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const urls = getPostgresUrls();
  let lastError: unknown;

  for (let offset = 0; offset < urls.length; offset += 1) {
    const index = (activeUrlIndex + offset) % urls.length;
    const url = urls[index]!;
    const client = await getPoolForUrl(url).connect();

    try {
      await client.query("begin");
      const result = await callback(client);
      await client.query("commit");
      activeUrlIndex = index;
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      lastError = error;

      if (!isFailoverError(error) || urls.length === 1) {
        throw error;
      }

      await closePool(url);
      console.warn(`PostgreSQL transaction failed, trying fallback ${offset + 1}/${urls.length - 1}`);
    } finally {
      client.release();
    }
  }

  throw lastError;
}

export async function closePostgres(): Promise<void> {
  await Promise.all([...pools.values()].map((entry) => entry.end()));
  pools.clear();
  activeUrlIndex = 0;
}

function getPostgresUrls(): string[] {
  const urls = (env.POSTGRES_URLS ?? env.POSTGRES_URL ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  if (urls.length === 0) {
    throw new Error("POSTGRES_URL or POSTGRES_URLS is required when DATABASE_PROVIDER=postgres");
  }

  return urls;
}

async function closePool(url: string): Promise<void> {
  const pool = pools.get(url);
  if (!pool) return;
  pools.delete(url);
  await pool.end().catch(() => undefined);
}

function isFailoverError(error: unknown): boolean {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return (
    code.startsWith("08") ||
    ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "57P01", "57P02", "57P03"].includes(code) ||
    message.includes("connection terminated") ||
    message.includes("timeout") ||
    message.includes("terminating connection")
  );
}
