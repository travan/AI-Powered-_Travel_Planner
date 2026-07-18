import type { QueryResultRow } from "pg";

export const POSTGRES_POOL = Symbol("POSTGRES_POOL");
export const SQL_CLIENT = Symbol("SQL_CLIENT");
export const SUPABASE_CLIENT = Symbol("SUPABASE_CLIENT");
export const MONGO_CLIENT = Symbol("MONGO_CLIENT");
export const MONGO_DATABASE = Symbol("MONGO_DATABASE");

export type SqlQueryResult<T> = {
  rows: T[];
};

export type SqlClient = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
};
