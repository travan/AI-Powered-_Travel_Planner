import {
  Inject,
  Injectable,
  HttpException,
  ConflictException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import {
  POSTGRES_POOL,
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import type { GenerateItineraryDto } from "../dto/itinerary.dto.js";
import { generationKey } from "./generation-input.js";
import { generationError } from "./generation-error.js";
import { acquireAiPermit } from "./ai-permit.js";
import { PlanningGenerationError } from "@travel/ai";

@Injectable()
export class GenerationStore {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    @Inject(SQL_CLIENT) private readonly sql: SqlClient,
  ) {}

  async admit(user: string, dto: GenerateItineraryDto, key?: string) {
    const client = await this.pool.connect();
    const hash =
      generationKey(dto) + (dto.force_refresh ? `:${key ?? randomUUID()}` : "");
    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,58317291))",
        [user],
      );
      if (key) {
        const previous = await client.query<{ id: string; matches: boolean }>(
          `select job_id::text as id,payload=$3::jsonb as matches from planning_submission_keys where user_id=$1 and key=$2
           union all select id::text,payload=$3::jsonb as matches from itinerary_jobs where user_id=$1 and idempotency_key=$2 limit 1`,
          [user, key, { dto }],
        );
        if (previous.rows[0]) {
          if (!previous.rows[0].matches)
            throw new ConflictException({ code: "IDEMPOTENCY_CONFLICT" });
          await client.query("commit");
          return previous.rows[0].id;
        }
      }
      const active = await client.query<{ id: string }>(
        "select id::text from itinerary_jobs where user_id=$1 and request_hash=$2 and pipeline_version=2 and status in ('queued','processing')",
        [user, hash],
      );
      if (active.rows[0]) {
        if (key)
          await client.query(
            "insert into planning_submission_keys(user_id,key,job_id,payload) values($1,$2,$3,$4)",
            [user, key, active.rows[0].id, { dto }],
          );
        await client.query("commit");
        return active.rows[0].id;
      }
      const quotas = await client.query<{ allowed: boolean }>(
        `select
        (select count(*) from itinerary_jobs where user_id=$1 and status in ('queued','processing'))<5
        and (select count(*) from itinerary_jobs where user_id=$1 and created_at>now()-interval '1 minute')<20 as allowed`,
        [user],
      );
      if (!quotas.rows[0]?.allowed)
        throw new HttpException({ code: "TOO_MANY_JOBS" }, 429);
      const generation = randomUUID();
      // Finish all dependent writes in one round trip. The admission counter is
      // locked by the job trigger until commit, so no extra query belongs after it.
      const inserted = await client.query<{ id: string }>(
        `with generation as (
          insert into planning_generations(id,user_id,request_hash)
          values($4,$1,$5) returning id
        ), admitted as (
          insert into itinerary_jobs(user_id,kind,payload,idempotency_key,pipeline_version,generation_id,request_hash,deadline_at)
          select $1,'generate',$2,$3,2,generation.id,$5,now()+interval '30 minutes' from generation
          returning id
        ), submission as (
          insert into planning_submission_keys(user_id,key,job_id,payload)
          select $1,$3,admitted.id,$2 from admitted where $3::text is not null
          returning job_id
        ) select id::text from admitted`,
        [user, { dto }, key ?? null, generation, hash],
      );
      await client.query("commit");
      return inserted.rows[0]!.id;
    } catch (error) {
      await client.query("rollback");
      if ((error as { code?: string }).code === "P0001")
        throw new HttpException({ code: "TOO_MANY_JOBS" }, 429);
      throw error;
    } finally {
      client.release();
    }
  }

  async checkpoint<T>(generation: string): Promise<T | undefined> {
    return (
      await this.sql.query<{ checkpoint: T }>(
        "select checkpoint from planning_generations where id=$1",
        [generation],
      )
    ).rows[0]?.checkpoint;
  }
  async resume(user: string, job: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,58317291))",
        [user],
      );
      const existing = await client.query<{ status: string }>(
        "select status from itinerary_jobs where id=$1 and user_id=$2 and pipeline_version=2 for update",
        [job, user],
      );
      if (!existing.rows[0])
        throw new ConflictException({ code: "PLANNING_FAILED" });
      if (existing.rows[0].status === "failed") {
        const active = await client.query<{ count: number }>(
          "select count(*)::int as count from itinerary_jobs where user_id=$1 and status in ('queued','processing')",
          [user],
        );
        if (active.rows[0]!.count >= 5)
          throw new HttpException({ code: "TOO_MANY_JOBS" }, 429);
        await client.query(
          "update itinerary_jobs set status='queued',stage='queued',attempts=0,available_at=now(),error_code=null,error_params=null where id=$1 and user_id=$2",
          [job, user],
        );
      } else if (!["queued", "processing"].includes(existing.rows[0].status))
        throw new ConflictException({ code: "PLANNING_FAILED" });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      if ((error as { code?: string }).code === "P0001")
        throw new HttpException({ code: "TOO_MANY_JOBS" }, 429);
      throw error;
    } finally {
      client.release();
    }
  }
  async save(generation: string, job: string, claim: string, value: unknown) {
    const result = await this.sql.query(
      `update planning_generations set checkpoint=$4 where id=$1
      and exists(select 1 from itinerary_jobs where id=$2 and generation_id=$1 and claim_token=$3 and status='processing') returning id`,
      [generation, job, claim, value],
    );
    if (!result.rows.length) throw new Error("Planning job claim lost");
  }

  async once<T>(
    generation: string,
    work: () => Promise<T>,
    preflight?: () => void,
  ): Promise<T> {
    const existing = await this.sql.query<{
      state: string;
      response: T;
      error_code: string;
    }>(
      "select state,response,error_code from planning_generation_ai where generation_id=$1",
      [generation],
    );
    const row = existing.rows[0];
    if (row?.state === "received") return row.response;
    if (row?.error_code === "AI_QUOTA_EXHAUSTED")
      throw new PlanningGenerationError("AI_QUOTA_EXHAUSTED");
    if (row)
      throw new HttpException(
        { code: row.error_code ?? "AI_RESULT_UNKNOWN" },
        422,
      );
    // Acquire capacity before consuming this generation's single dispatch ticket.
    preflight?.();
    const release = await acquireAiPermit(this.sql);
    let reserved;
    try {
      reserved = await this.sql.query(
        "insert into planning_generation_ai(generation_id,state) values($1,'calling') on conflict do nothing returning generation_id",
        [generation],
      );
    } catch (error) {
      await release().catch(() => {});
      throw error;
    }
    if (!reserved.rows.length) {
      await release();
      return this.once(generation, work, preflight);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const pending = Promise.resolve()
        .then(work)
        .finally(() => release().catch(() => {}));
      const value = await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new HttpException({ code: "AI_RESULT_UNKNOWN" }, 422)),
            180_000,
          );
          timer.unref?.();
        }),
      ]);
      await this.sql.query(
        "update planning_generation_ai set state='received',response=$2,completed_at=now() where generation_id=$1 and state='calling'",
        [generation, value],
      );
      return value;
    } catch (error) {
      const body =
        error instanceof HttpException ? error.getResponse() : undefined;
      const candidate =
        (typeof body === "object" && body && "code" in body
          ? String(body.code)
          : undefined) ??
        (error as { code?: string }).code ??
        "AI_RESULT_UNKNOWN";
      const code = [
        "AI_RESULT_UNKNOWN",
        "AI_RESPONSE_INVALID",
        "AI_QUOTA_EXHAUSTED",
      ].includes(candidate)
        ? candidate
        : "AI_RESULT_UNKNOWN";
      await this.sql
        .query(
          "update planning_generation_ai set state=$2,error_code=$3,completed_at=now() where generation_id=$1 and state='calling'",
          [
            generation,
            code === "AI_RESULT_UNKNOWN" ? "unknown" : "failed",
            code,
          ],
        )
        .catch(() => {});
      if (code === "AI_RESULT_UNKNOWN") generationError("AI_RESULT_UNKNOWN");
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async recordUsage(generation: string, usage: unknown) {
    await this.sql.query(
      "update planning_generation_ai set usage=$2 where generation_id=$1",
      [generation, JSON.stringify(usage)],
    );
  }
}
