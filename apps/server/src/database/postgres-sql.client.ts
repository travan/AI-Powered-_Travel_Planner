import { logContext } from "../observability/logger.js";
import type { Pool, QueryResultRow } from "pg";
import type { SqlClient, SqlQueryResult } from "./database.tokens.js";

export class PostgresSqlClient implements SqlClient {
  constructor(private readonly pool: Pool) {}

  async query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<SqlQueryResult<T>> {
    const scope = logContext.getStore();
    if (scope?.queryCount !== undefined) scope.queryCount++;
    const result = await this.pool.query<T>(text, params);
    return { rows: result.rows };
  }
}
