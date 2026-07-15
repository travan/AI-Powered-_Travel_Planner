import pg, { type Pool, type QueryResult, type QueryResultRow } from "pg";
import { env } from "../env.js";

const { Pool: PgPool } = pg;

let pool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (!pool) {
    if (!env.POSTGRES_URL) {
      throw new Error("POSTGRES_URL is required when DATABASE_PROVIDER=postgres");
    }

    pool = new PgPool({
      connectionString: env.POSTGRES_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<QueryResult<T>> {
  return getPostgresPool().query<T>(text, values);
}

export async function closePostgres(): Promise<void> {
  await pool?.end();
  pool = null;
}
