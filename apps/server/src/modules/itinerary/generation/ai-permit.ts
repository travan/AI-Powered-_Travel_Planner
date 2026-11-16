import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { SqlClient } from "../../../database/database.tokens.js";

export async function acquireAiPermit(sql: SqlClient) {
  const capacity = Number(process.env.PLANNING_AI_CONCURRENCY ?? 1);
  if (![1, 2, 4, 8, 16].includes(capacity))
    throw new Error("Invalid measured AI concurrency");
  const token = randomUUID();
  const result = await sql.query<{ id: number }>(
    `with free as (
    select id from planning_ai_slots where id<=$1 and (locked_until is null or locked_until<now())
    order by id for update skip locked limit 1
  ) update planning_ai_slots s set token=$2,locked_until=now()+interval '15 minutes'
    from free where s.id=free.id returning s.id`,
    [capacity, token],
  );
  if (!result.rows.length)
    throw new HttpException({ code: "AI_CAPACITY_BUSY" }, 503);
  return async () => {
    await sql.query(
      "update planning_ai_slots set token=null,locked_until=null where token=$1",
      [token],
    );
  };
}
export async function withAiPermit<T>(
  sql: SqlClient,
  work: () => Promise<T>,
): Promise<T> {
  const release = await acquireAiPermit(sql);
  try {
    return await work();
  } finally {
    await release();
  }
}
