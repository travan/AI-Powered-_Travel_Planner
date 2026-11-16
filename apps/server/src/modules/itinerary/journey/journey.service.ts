import type {
  CatalogJob,
  DayTemplate,
  PlanningProgress,
} from "../application/catalog-itinerary.js";
import { logEvent } from "../../../observability/logger.js";
import { createHash } from "node:crypto";
import {
  createAIProvider,
  normalizeOllamaItinerary,
  MockAIProvider,
  PlanningGenerationError,
  type AIProviderName,
  type AIProvider,
} from "@travel/ai";
import { workerRequestContext } from "../../../cloudflare/request-context.js";
import { protectTranslationText } from "./translation-text.js";
import { GenerationStore } from "../generation/generation.store.js";
import { CatalogFirstPlanner } from "../generation/catalog-first-planner.js";
import type { Snapshot } from "../generation/planning-data.js";
import { generationKey } from "../generation/generation-input.js";
import {
  generationError,
  generationErrorParams,
} from "../generation/generation-error.js";
import {
  classifyJobError,
  generationCodes,
  planningErrorParams,
  publicJobError,
} from "./planning-job-error.js";
import type { ItineraryTranslation } from "@travel/types";
import type { TranslationDto } from "./journey.dto.js";
import {
  BadRequestException,
  HttpException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { Pool } from "pg";
import {
  POSTGRES_POOL,
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import type {
  AccommodationBooking,
  AiTokenUsage,
  Itinerary,
  PlanningJob,
  PlanningJobSummary,
  PlanningCriteria,
  ItineraryDay,
  PlanRevision,
} from "@travel/types";
import * as travelTypes from "@travel/types";
const {
  itineraryTextSegments,
  applyItineraryTranslation,
  upgradeJourneyPlan,
  validatePlanning,
  localTripInstant,
  validTripDate,
} =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;
import { ItineraryService } from "../application/itinerary.service.js";
import type { GenerateItineraryDto } from "../dto/itinerary.dto.js";
import type {
  AccommodationDto,
  ResolveLocationDto,
  RevisionDto,
} from "./journey.dto.js";

type TranslationPayload = {
  sourceKind: "itinerary" | "trip";
  sourceId: string;
  sourceVersion: string;
  target: "en" | "vi";
};
type JobRow = PlanningJob & {
  user_id: string;
  payload: Partial<TranslationPayload> & {
    dto?: GenerateItineraryDto;
    tripId?: string;
    revision?: RevisionDto;
  };
  kind: string;
  claim_token: string;
  planning_progress?: PlanningProgress;
  planning_reuse?: boolean;
  pipeline_version?: number;
  generation_id?: string;
  deadline_at?: string;
};
type TripPlan = {
  current_plan: Itinerary | null;
  original: Itinerary;
  planning_version: number;
  planning_locked_ids: string[];
  role: string;
};

@Injectable()
export class JourneyService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private processing = false;
  private readonly logger = new Logger(JourneyService.name);
  constructor(
    @Inject(SQL_CLIENT) private readonly sql: SqlClient,
    @Inject(ItineraryService) private readonly itineraries: ItineraryService,
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    @Optional()
    @Inject(GenerationStore)
    private readonly generations?: GenerationStore,
    @Optional()
    @Inject(CatalogFirstPlanner)
    private readonly catalogFirst?: CatalogFirstPlanner,
  ) {}
  onModuleInit() {
    if (
      process.env.RUNTIME_TARGET === "cloudflare" ||
      process.env.JOURNEY_MVP_ENABLED === "false"
    )
      return;
    this.timer = setInterval(() => {
      void this.processNextJob().catch(() =>
        logEvent("journey.worker_failed", "error"),
      );
    }, 1500);
    this.timer.unref?.();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async enqueue(userId: string, dto: GenerateItineraryDto, key?: string) {
    if (process.env.JOURNEY_MVP_ENABLED === "false")
      throw new BadRequestException({
        code: "JOURNEY_DISABLED",
        params: {},
        message: "Tính năng hành trình đang tắt.",
      });
    const check = validatePlanning(
      dto as Parameters<typeof validatePlanning>[0],
    );
    if (!check.valid)
      throw new BadRequestException({
        ...check,
        code: "PLANNING_INVALID",
        params: {},
        message: "Planning criteria are invalid.",
      });
    if (key !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(key))
      throw new BadRequestException("Invalid idempotency key");
    const percent = Number(process.env.PLANNING_V2_PERCENT ?? 0);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100)
      throw new Error("Invalid planning rollout percentage");
    const selected =
      percent > 0 &&
      (parseInt(
        createHash("sha256")
          .update(userId + generationKey(dto))
          .digest("hex")
          .slice(0, 8),
        16,
      ) /
        0x100000000) *
        100 <
        percent;
    const context = workerRequestContext.getStore();
    if (
      selected &&
      process.env.RUNTIME_TARGET === "cloudflare" &&
      !context?.queue
    )
      throw new HttpException({ code: "PLANNING_QUEUE_UNAVAILABLE" }, 503);
    if (selected && !this.generations)
      throw new Error("Generation v2 store unavailable");
    const id = selected
      ? await this.generations!.admit(userId, dto, key)
      : await this.admitJob(userId, "generate", { dto }, key);
    if (context?.queue)
      await context.queue
        .send({ jobId: id })
        .catch(() =>
          logEvent("journey.dispatch_deferred", "warn", { jobId: id }),
        );
    return {
      status: "queued" as const,
      job_id: id,
      stream_url: `/api/itinerary/jobs/${id}`,
    };
  }

  private async admitJob(
    userId: string,
    kind: string,
    payload: object,
    key?: string,
    progress?: PlanningProgress,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1,58317291))",
        [userId],
      );
      if (key) {
        const existing = await client.query<{ id: string; matches: boolean }>(
          `select j.id::text,k.payload=$3::jsonb and j.kind=$4 as matches from planning_submission_keys k join itinerary_jobs j on j.id=k.job_id where k.user_id=$1 and k.key=$2
           union all select id::text,payload=$3::jsonb and kind=$4 as matches from itinerary_jobs where user_id=$1 and idempotency_key=$2 limit 1`,
          [userId, key, payload, kind],
        );
        if (existing.rows[0]) {
          if (!existing.rows[0].matches)
            throw new ConflictException({
              code: "IDEMPOTENCY_CONFLICT",
              message: "This key belongs to another request.",
            });
          await client.query("commit");
          return existing.rows[0].id;
        }
      }
      if (kind === "translate") {
        const existing = await client.query<{ id: string }>(
          "select id::text from itinerary_jobs where user_id=$1 and kind='translate' and status in ('queued','processing') and payload=$2::jsonb limit 1",
          [userId, payload],
        );
        if (existing.rows[0]) {
          await client.query("commit");
          return existing.rows[0].id;
        }
      }
      const result = await client.query<{ id: string }>(
        `insert into itinerary_jobs(user_id,kind,payload,idempotency_key,planning_progress,planning_reuse)
         select $1,$2,$3,$4,$5::jsonb,case when $5::jsonb is null then null else true end where
           (select count(*) from itinerary_jobs where user_id=$1 and status in ('queued','processing')) < 5
           and (select count(*) from itinerary_jobs where status in ('queued','processing')) < 1500
           and (select count(*) from itinerary_jobs where user_id=$1 and created_at>now()-interval '1 minute') < 20
         returning id::text`,
        [userId, kind, payload, key ?? null, progress ?? null],
      );
      if (!result.rows[0])
        throw new HttpException(
          {
            code: "TOO_MANY_JOBS",
            params: {},
            message: "Hàng đợi đang bận. Vui lòng thử lại sau.",
          },
          429,
        );
      await client.query("commit");
      return result.rows[0].id;
    } catch (error) {
      await client.query("rollback");
      if ((error as { code?: string }).code === "P0001")
        throw new HttpException({ code: "TOO_MANY_JOBS" }, 429);
      throw error;
    } finally {
      client.release();
    }
  }

  async reserveDispatch(limit: number) {
    return (
      await this.sql.query<{ job_id: string }>(
        `with due as (
        select job_id from journey_job_dispatch where available_at<=now()
        order by available_at,job_id for update skip locked limit $1
      ) update journey_job_dispatch d set available_at=now()+interval '2 minutes'
        from due where d.job_id=due.job_id returning d.job_id::text`,
        [limit],
      )
    ).rows;
  }

  async expireJobs() {
    if (Number(process.env.PLANNING_V2_PERCENT ?? 0) > 0)
      await this.sql.query(
        `update itinerary_jobs set status='failed',stage='failed',error_code='GENERATION_DEADLINE_EXCEEDED',error=null,error_params=null,completed_at=now(),locked_until=null,claim_token=null where pipeline_version=2 and status in ('queued','processing') and deadline_at<=now()`,
      );
    await this.sql.query(
      `update itinerary_jobs set status='failed',stage='failed',
       error_code='PLANNING_FAILED',error_params=null,error=null,locked_until=null,claim_token=null
       where status='processing' and locked_until<now() and attempts>=3`,
    );
  }

  async retryJob(userId: string, id: string, key?: string) {
    if (key !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(key))
      throw new BadRequestException("Invalid idempotency key");
    const result = await this.sql.query<{
      payload: { dto: GenerateItineraryDto };
      error_code: string;
      error_params?: { retry_at?: string };
      planning_progress?: PlanningProgress;
      pipeline_version?: number;
      generation_id?: string;
      deadline_at?: string;
    }>(
      "select payload,error_code,error_params,planning_progress,pipeline_version,generation_id,deadline_at from itinerary_jobs where id=$1 and user_id=$2 and kind='generate' and (status='failed' or pipeline_version=2 and status in ('queued','processing'))",
      [id, userId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException("Failed planning job not found.");
    if (row.pipeline_version === 2) {
      if (row.deadline_at && Date.parse(row.deadline_at) <= Date.now())
        generationError("GENERATION_DEADLINE_EXCEEDED");
      await this.generations!.resume(userId, id);
      const queue = workerRequestContext.getStore()?.queue;
      if (queue)
        await queue
          .send({ jobId: id })
          .catch(() =>
            logEvent("journey.dispatch_deferred", "warn", { jobId: id }),
          );
      return {
        status: "queued" as const,
        job_id: id,
        stream_url: `/api/itinerary/jobs/${id}`,
      };
    }
    if (row.error_code === "PLANNING_INVALID")
      throw new ConflictException({
        code: "PLANNING_INVALID",
        message: "Please update the planning form.",
      });
    if (
      row.error_code === "AI_QUOTA_EXHAUSTED" &&
      Date.parse(row.error_params?.retry_at ?? "") > Date.now()
    )
      throw new ConflictException({
        code: "AI_QUOTA_EXHAUSTED",
        params: row.error_params,
      });
    // Legacy retries stay on their pinned strategy even after a v2 canary starts.
    const jobId = await this.admitJob(
      userId,
      "generate",
      row.payload,
      key,
      row.planning_progress,
    );
    const queue = workerRequestContext.getStore()?.queue;
    if (queue)
      await queue
        .send({ jobId })
        .catch(() => logEvent("journey.dispatch_deferred", "warn", { jobId }));
    return {
      status: "queued" as const,
      job_id: jobId,
      stream_url: `/api/itinerary/jobs/${jobId}`,
    };
  }

  async listJobs(userId: string): Promise<PlanningJobSummary[]> {
    // Uses itinerary_jobs_user_idx; exclude translation and revision jobs.
    const result = await this.sql.query<
      PlanningJobSummary & {
        journey?: PlanningCriteria["journey"];
        city_slugs?: string[];
        saved_days?: ItineraryDay[];
      }
    >(
      `select j.id::text,j.status,j.stage,j.attempts,j.itinerary_id::text,j.created_at,
        coalesce(j.payload->'dto'->'city_names', '[]'::jsonb) as city_names,
        coalesce(i.result->'planning'->'journey', j.payload->'dto'->'planning'->'journey') as journey,
        coalesce(nullif(i.result->'planning'->'journey'->'destinations', '[]'::jsonb), j.payload->'dto'->'cities') as city_slugs,
        case when j.payload->'dto'->'cities' is null then i.result->'days' end as saved_days,
        coalesce((j.payload->'dto'->>'num_days')::int,
          (j.payload->'dto'->>'end_date')::date - (j.payload->'dto'->>'start_date')::date + 1,
          0) as num_days
       from itinerary_jobs j
       left join itineraries i on i.id=j.itinerary_id and i.user_id=j.user_id::text
       where j.user_id=$1 and j.kind='generate'
       order by j.created_at desc, j.id desc limit 20`,
      [userId],
    );
    const jobs = result.rows.map(
      ({ journey, city_slugs, saved_days, ...job }) => {
        const stops = city_slugs?.length
          ? city_slugs.map((slug, index) => ({
              slug,
              label: job.city_names[index] ?? slug,
            }))
          : (saved_days?.map((day) => ({
              slug: day.city_slug,
              label: day.city,
              names: day.city_names,
            })) ?? job.city_names.map((label) => ({ slug: undefined, label })));
        return { job, journey, stops };
      },
    );
    const cities = await this.itineraries.lookupRouteCities(
      jobs.flatMap(({ journey, stops }) =>
        [
          ...stops.flatMap((stop) => [stop.slug, stop.label]),
          journey?.origin.label,
          journey?.endpoint?.label,
        ].filter((value): value is string => !!value),
      ),
    );
    return jobs.map(({ job, journey, stops }) => ({
      ...job,
      route: this.itineraries.describeRoute(journey, stops, cities),
    }));
  }

  async listStatuses(userId: string, ids: string[]) {
    return (
      await this.sql.query<PlanningJob>(
        `select id::text,status,stage,attempts,itinerary_id::text
       from itinerary_jobs where user_id=$1 and id=any($2::uuid[]) and kind='generate'`,
        [userId, ids],
      )
    ).rows;
  }

  async getJob(userId: string, id: string) {
    const result = await this.sql.query<
      PlanningJob & {
        source_kind?: TranslationPayload["sourceKind"];
        source_id?: string;
        trip_id?: string;
      }
    >(
      `select id::text,status,stage,attempts,itinerary_id::text,revision_id::text,translation_id::text,
        error_code,error_params,kind,
        case when kind='translate' then payload->>'sourceKind' end as source_kind,
        case when kind='translate' then payload->>'sourceId' end as source_id,
        case when kind='revision' then payload->>'tripId' end as trip_id
        from itinerary_jobs where id=$1 and user_id=$2`,
      [id, userId],
    );
    if (!result.rows[0])
      throw new NotFoundException({
        code: "JOB_NOT_FOUND",
        params: {},
        message: "Không tìm thấy yêu cầu.",
      });
    const row = result.rows[0];
    if (row.kind === "translate" && row.source_kind && row.source_id)
      await this.translationSource(userId, row.source_kind, row.source_id);
    if (row.kind === "revision" && row.trip_id)
      await this.member(row.trip_id, userId);
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      stage: row.stage,
      attempts: row.attempts,
      itinerary_id: row.itinerary_id,
      revision_id: row.revision_id,
      translation_id: row.translation_id,
      error_code:
        row.status === "failed" ? publicJobError(row.error_code) : null,
      ...(row.status === "failed" && row.error_code === "PLANNING_INVALID"
        ? { error_params: planningErrorParams(row.error_params?.reason) }
        : row.status === "failed" && generationCodes.has(row.error_code ?? "")
          ? { error_params: generationErrorParams(row.error_params?.reason) }
          : row.status === "failed" && row.error_code === "AI_QUOTA_EXHAUSTED"
            ? { error_params: { retry_at: row.error_params?.retry_at } }
            : {}),
    };
  }
  async processNextJob(id?: string) {
    if ((!id && this.processing) || process.env.JOURNEY_MVP_ENABLED === "false")
      return;
    if (!id) this.processing = true;
    let job: JobRow | undefined;
    let stage = "claim";
    let catalogJob: CatalogJob | undefined;
    const usage: Array<AiTokenUsage & { stage: string; day?: number }> = [];
    let outcome = "failed";
    let cacheHit = false;
    try {
      const claimed = await this.sql.query<JobRow>(
        `with candidate as (
        select id from itinerary_jobs where ($1::uuid is null or id=$1) and attempts < 3 and ((status='queued' and available_at<=now()) or (status='processing' and locked_until<now()))
        order by created_at for update skip locked limit 1)
        update itinerary_jobs j set status='processing',stage='catalog',attempts=j.attempts+1,
          locked_until=now()+interval '20 minutes',claim_token=gen_random_uuid()
        from candidate c where j.id=c.id returning j.*`,
        [id ?? null],
      );
      job = claimed.rows[0];
      if (!job) return;
      const current = job;
      if (
        job.pipeline_version === 2 &&
        job.deadline_at &&
        Date.parse(job.deadline_at) <= Date.now()
      )
        generationError("GENERATION_DEADLINE_EXCEEDED");
      stage = "catalog";
      const mockDelay = Number(process.env.JOURNEY_STAGING_DELAY_MS);
      if (
        job.pipeline_version !== 2 &&
        process.env.AI_PROVIDER === "mock" &&
        mockDelay === 30_000
      )
        await new Promise<void>((resolve) => setTimeout(resolve, mockDelay));
      let itineraryId: string | undefined,
        revisionId: string | undefined,
        translationId: string | undefined;
      if (job.kind === "translate") {
        stage = "translate";
        await this.sql.query(
          "update itinerary_jobs set stage='translate' where id=$1 and claim_token=$2",
          [job.id, job.claim_token],
        );
        translationId = await this.buildTranslation(
          job.user_id,
          job.payload as TranslationPayload,
        );
      } else if (job.kind === "revision") {
        stage = "revision";
        revisionId = await this.buildRevision(
          job.user_id,
          job.payload.tripId!,
          job.payload.revision!,
        );
      } else if (job.itinerary_id) {
        itineraryId = job.itinerary_id;
      } else {
        const configured = Number(process.env.PLANNING_CATALOG_PERCENT ?? 0);
        const brief = current.payload.dto?.prompt_text?.trim();
        const structured =
          current.payload.dto?.planning &&
          (!brief || brief === "Lập hành trình");
        const selected =
          process.env.AI_PROVIDER === "cloudflare" &&
          structured &&
          configured > 0 &&
          (parseInt(current.id.slice(0, 8), 16) / 0x100000000) * 100 <
            configured;
        if (
          current.pipeline_version !== 2 &&
          (current.planning_reuse ?? selected)
        ) {
          catalogJob = {
            id: current.id,
            claimToken: current.claim_token,
            progress: current.planning_progress ?? { days: [] },
            save: async (progress) => {
              const updated = await this.sql.query(
                `update itinerary_jobs set planning_progress=$3,planning_reuse=true,
                   locked_until=now()+interval '20 minutes'
                 where id=$1 and claim_token=$2 and status='processing' returning id`,
                [current.id, current.claim_token, progress],
              );
              if (!updated.rows.length)
                throw new Error("Planning job claim lost");
            },
            templates: async (cities) =>
              (
                await this.sql.query<DayTemplate>(
                  `select city_slug,place_ids,activity_ids,quality::float,verified_at::text
                 from planning_day_templates where approved and city_slug=any($1::text[])
                 and verified_at >= now()-interval '180 days'
                 order by quality desc,verified_at desc,id limit 200`,
                  [[...new Set(cities)]],
                )
              ).rows,
            usage: (entry, day) =>
              usage.push({ ...entry, stage: entry.phase ?? stage, day }),
          };
        }
        const generateOptions = {
          userId: job.user_id,
          catalogJob,
          onUsage: (entry: AiTokenUsage) =>
            usage.push({
              ...entry,
              stage: entry.phase ?? entry.operation,
              day: entry.day,
            }),
          dto: {
            ...job.payload.dto!,
            ...(job.attempts > 1 ? { force_refresh: false } : {}),
          },
          onStage: async (nextStage: string) => {
            stage = nextStage;
            await this.sql.query(
              `update itinerary_jobs set stage=$3,locked_until=now()+interval '20 minutes' where id=$1 and claim_token=$2 and status='processing'`,
              [current.id, current.claim_token, nextStage],
            );
          },
        };
        const result =
          job.pipeline_version === 2
            ? await this.catalogFirst!.generate({
                ...generateOptions,
                job: {
                  id: job.id,
                  generation_id: job.generation_id!,
                  claim_token: job.claim_token,
                },
              })
            : await this.itineraries.generate(generateOptions);
        if (result.status === "unsupported") {
          const status =
            result.code === "AI_UNAVAILABLE"
              ? 503
              : result.code === "UNSUPPORTED_DESTINATION"
                ? 400
                : 422;
          throw new HttpException({ code: result.code }, status);
        }
        if (result.status !== "cached" || !result.itinerary_id)
          throw new Error("Missing itinerary ID");
        cacheHit = result.cache_hit === true;
        itineraryId = result.itinerary_id;
      }
      stage = "persist";
      await this.sql.query(
        `update itinerary_jobs set status='complete',stage='complete',itinerary_id=$3,revision_id=$4,translation_id=$5,completed_at=now(),locked_until=null,error=null,error_code=null,error_params=null where id=$1 and claim_token=$2`,
        [
          job.id,
          job.claim_token,
          itineraryId ?? null,
          revisionId ?? null,
          translationId ?? null,
        ],
      );
      outcome = cacheHit ? "cache_hit" : "complete";
      this.logger.log(
        JSON.stringify({
          event: "journey_job_complete",
          id: job.id,
          attempts: job.attempts,
          kind: job.kind,
        }),
      );
    } catch (error) {
      const capacityBusy =
        error instanceof HttpException &&
        typeof error.getResponse() === "object" &&
        (error.getResponse() as { code?: string }).code === "AI_CAPACITY_BUSY";
      const failure = capacityBusy
        ? {
            code: "AI_CAPACITY_BUSY",
            params: {},
            status: 503,
            terminal: false,
            retrySeconds: 15,
          }
        : classifyJobError(error, stage, job?.kind ?? "");
      if (error instanceof PlanningGenerationError && error.details) {
        for (const issue of error.details.issues.slice(0, 5))
          logEvent("journey.ai_validation_failed", "error", {
            jobId: job?.id,
            stage,
            day: error.details.day,
            slot: issue.slot,
            code: issue.code,
          });
      }
      outcome = failure.code;
      logEvent("journey.job_failed", "error", {
        jobId: job?.id,
        stage,
        attempts: job?.attempts,
        status: failure.status,
        code: failure.params.reason ?? failure.code,
        willRetry: Boolean(job && job.attempts < 3 && !failure.terminal),
      });
      if (job)
        await this.sql.query(
          `update itinerary_jobs set status=case when ${capacityBusy ? "false" : "attempts>=3 or $3"} then 'failed' else 'queued' end,
        stage=case when ${capacityBusy ? "false" : "attempts>=3 or $3"} then 'failed' else 'retry' end,available_at=now()+make_interval(secs=>$7),locked_until=null,claim_token=null,
        error=$4,error_code=$5,error_params=$6${capacityBusy ? ",attempts=greatest(0,attempts-1)" : ""} where id=$1 and claim_token=$2 and status='processing'`,
          [
            job.id,
            job.claim_token,
            failure.terminal,
            null,
            failure.code,
            failure.params,
            failure.retrySeconds,
          ],
        );
      else throw error;
    } finally {
      if (job?.kind === "generate") {
        const checkpoint =
          job.pipeline_version === 2
            ? await this.generations
                ?.checkpoint<Snapshot>(job.generation_id!)
                .catch(() => undefined)
            : undefined;
        const days = checkpoint?.days ?? catalogJob?.progress.days ?? [];
        const aiDays = days.filter((day) => {
          if (checkpoint?.schedule && checkpoint.items) {
            const scheduled = checkpoint.schedule.find(
              (s) => s.day === day.day_number,
            );
            return (
              scheduled?.slots.some(
                (s) =>
                  checkpoint.items[s.itemKey ?? s.coveredBy ?? ""]?.source ===
                  "ai_suggestion",
              ) ||
              checkpoint.items[`${scheduled?.destination}/stay`]?.source ===
                "ai_suggestion"
            );
          }
          return day.activities.some(
            (item) => item.evidence?.source === "ai_suggestion",
          );
        }).length;
        await this.sql
          .query(
            `insert into planning_ai_attempts(claim_token,job_id,attempt,strategy,outcome,catalog_days,ai_days,calls)
             values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict (claim_token) do nothing`,
            [
              job.claim_token,
              job.id,
              job.attempts,
              job.pipeline_version === 2
                ? "catalog_v2"
                : catalogJob
                  ? "catalog"
                  : "legacy",
              outcome,
              days.length - aiDays,
              aiDays,
              JSON.stringify(usage),
            ],
          )
          .catch(() =>
            logEvent("journey.usage_write_failed", "warn", { jobId: job?.id }),
          );
      }
      if (!id) {
        this.processing = false;
        await this.expireJobs().catch(() =>
          logEvent("journey.expire_failed", "error"),
        );
      }
    }
  }

  private translationError(code: string, status = 400): never {
    throw new HttpException({ code, params: {}, message: code }, status);
  }
  private async translationSource(
    userId: string,
    sourceKind: "itinerary" | "trip",
    sourceId: string,
  ) {
    if (sourceKind === "trip") return this.getPlan(sourceId, userId);
    const result = await this.itineraries.getVisible({
      itineraryId: sourceId,
      userId,
    });
    if (!result.ok || !result.value.result)
      return this.translationError("SOURCE_NOT_FOUND", 404);
    return {
      id: result.value.id,
      ...normalizeOllamaItinerary(result.value.result),
    };
  }
  private sourceVersion(
    plan: Itinerary,
    sourceKind: "itinerary" | "trip",
    sourceId: string,
  ) {
    // Forecast refreshes are independent of the saved text/revision being translated.
    const sourcePlan = { ...plan };
    delete sourcePlan.weather;
    return createHash("sha256")
      .update(JSON.stringify({ sourceKind, sourceId, plan: sourcePlan }))
      .digest("hex");
  }
  async listTranslations(
    userId: string,
    sourceKind: "itinerary" | "trip",
    sourceId: string,
    target?: string,
  ) {
    if (target && !["en", "vi"].includes(target))
      return this.translationError("INVALID_LOCALE");
    const source = await this.translationSource(userId, sourceKind, sourceId);
    const version = this.sourceVersion(source, sourceKind, sourceId);
    const rows = await this.sql.query<ItineraryTranslation>(
      `select id::text,target_locale,source_locale,source_version,source_revision,texts,created_at from itinerary_translations where ${sourceKind === "trip" ? "trip_id" : "itinerary_id"}=$1 and ($2::text is null or target_locale=$2) order by created_at desc limit 20`,
      [sourceId, target ?? null],
    );
    return {
      source,
      source_version: version,
      source_locale: source.locale ?? null,
      translations: rows.rows.map((row) => ({
        ...row,
        stale: row.source_version !== version,
      })),
    };
  }
  async enqueueTranslation(
    userId: string,
    sourceKind: "itinerary" | "trip",
    sourceId: string,
    dto: TranslationDto,
  ) {
    const source = await this.translationSource(userId, sourceKind, sourceId);
    const sourceVersion = this.sourceVersion(source, sourceKind, sourceId);
    if (dto.source_version !== sourceVersion)
      return this.translationError("TRANSLATION_SOURCE_CHANGED", 409);
    const found = await this.listTranslations(
      userId,
      sourceKind,
      sourceId,
      dto.target_locale,
    );
    const cached = found.translations.find((t) => !t.stale);
    if (cached) return { status: "cached", translation: cached };
    if (source.locale === dto.target_locale)
      return this.translationError("TRANSLATION_SAME_LANGUAGE");
    const payload = {
      sourceKind,
      sourceId,
      sourceVersion,
      target: dto.target_locale,
    };
    const id = await this.admitJob(userId, "translate", payload);
    return {
      status: "queued",
      job_id: id,
      stream_url: `/api/itinerary/jobs/${id}`,
    };
  }
  private async buildTranslation(userId: string, payload: TranslationPayload) {
    const source = await this.translationSource(
      userId,
      payload.sourceKind,
      payload.sourceId,
    );
    if (
      this.sourceVersion(source, payload.sourceKind, payload.sourceId) !==
      payload.sourceVersion
    )
      return this.translationError("TRANSLATION_SOURCE_CHANGED", 409);
    const providerName = process.env.AI_PROVIDER ?? "openai";
    const provider: AIProvider =
      providerName === "mock"
        ? new MockAIProvider()
        : createAIProvider(providerName as AIProviderName, {
            workersAI: workerRequestContext.getStore()?.ai,
          });
    if (!provider.translateTexts)
      return this.translationError("TRANSLATION_PROVIDER_UNAVAILABLE", 400);
    const entries = Object.entries(itineraryTextSegments(source));
    const texts: Record<string, string> = {};
    // Bounded batches keep every provider within its response budget.
    for (let offset = 0; offset < entries.length; offset += 12) {
      const batch = Object.fromEntries(entries.slice(offset, offset + 12));
      const protectedBatch = protectTranslationText(source, batch);
      Object.assign(
        texts,
        protectedBatch.restore(
          await provider.translateTexts(protectedBatch.texts, payload.target),
        ),
      );
    }
    applyItineraryTranslation(source, texts); // Validate the complete allowlist before persistence.
    const latest = await this.translationSource(
      userId,
      payload.sourceKind,
      payload.sourceId,
    );
    if (
      this.sourceVersion(latest, payload.sourceKind, payload.sourceId) !==
      payload.sourceVersion
    )
      return this.translationError("TRANSLATION_SOURCE_CHANGED", 409);
    const result = await this.sql.query<{ id: string }>(
      `insert into itinerary_translations(itinerary_id,trip_id,source_version,source_revision,source_locale,target_locale,texts) values($1,$2,$3,$4,$5,$6,$7) on conflict(coalesce(itinerary_id,trip_id),source_version,target_locale) do update set texts=excluded.texts returning id::text`,
      [
        payload.sourceKind === "itinerary" ? payload.sourceId : null,
        payload.sourceKind === "trip" ? payload.sourceId : null,
        payload.sourceVersion,
        source.version ?? 1,
        source.locale ?? null,
        payload.target,
        texts,
      ],
    );
    return result.rows[0]!.id;
  }

  async resolveLocation(dto: ResolveLocationDto) {
    if (
      !dto.query &&
      (dto.latitude === undefined || dto.longitude === undefined)
    )
      throw new BadRequestException({
        code: "LOCATION_INPUT_REQUIRED",
        params: {},
        message: "Nhập địa điểm hoặc đủ tọa độ.",
      });
    const result = await this.sql.query<{
      id: string;
      label: string;
      city_slug: string;
      latitude: number | null;
      longitude: number | null;
      kind: string;
      distance_km: number | null;
    }>(
      `with candidates as (
      select slug as id,coalesce(name->>'vi',name->>'en',slug) as label,slug as city_slug,lat as latitude,lon as longitude,'city' as kind from cities
      union all select id::text,name,city_slug,lat,lon,'hub' from place_catalog where category in ('airport','train_station','bus_station','transport_hub') and is_outdated=false
    ) select *,case when $2::float8 is not null and latitude is not null and longitude is not null then
      6371 * 2 * asin(sqrt(least(1.0,power(sin(radians(latitude-$2)/2),2)+cos(radians($2))*cos(radians(latitude))*power(sin(radians(longitude-$3)/2),2)))) end as distance_km
      from candidates where ($1::text is null or label ilike '%'||$1||'%' or city_slug ilike '%'||$1||'%')
      and ($2::float8 is null or (latitude is not null and longitude is not null))
      order by distance_km asc nulls last,label limit 8`,
      [dto.query ?? null, dto.latitude ?? null, dto.longitude ?? null],
    );
    return {
      candidates: result.rows,
      distance_basis: "straight_line",
      requires_confirmation: true,
    };
  }
  private async member(tripId: string, userId: string, write = false) {
    const result = await this.sql.query<{ role: string }>(
      `select role from trip_members where trip_id=$1 and user_id=$2 and status='active'`,
      [tripId, userId],
    );
    const member = result.rows[0];
    if (!member)
      throw new NotFoundException({
        code: "TRIP_NOT_FOUND",
        params: {},
        message: "Không tìm thấy chuyến đi.",
      });
    if (write && member.role === "viewer")
      throw new ForbiddenException({
        code: "READ_ONLY",
        params: {},
        message: "Bạn chỉ có quyền xem.",
      });
    return member;
  }
  async listStays(
    tripId: string,
    userId: string,
  ): Promise<AccommodationBooking[]> {
    await this.member(tripId, userId);
    const result = await this.sql.query<AccommodationBooking>(
      `select id::text,trip_id::text,name,city,rooms,coalesce(guests,2) as guests,check_in_date::text,check_out_date::text,
      coalesce(nights,0) as nights,price_per_night::float8,total_price::float8,currency,booking_status,booking_provider,booking_reference,room_type,cancellation_policy,booking_url,
      (locked_at is not null) as locked,version from accommodations where trip_id=$1 order by check_in_date nulls last,created_at`,
      [tripId],
    );
    return result.rows;
  }
  async saveStay(
    tripId: string,
    userId: string,
    dto: AccommodationDto,
    id?: string,
  ) {
    const member = await this.member(tripId, userId, true);
    if (
      (dto.check_in_date && !validTripDate(dto.check_in_date)) ||
      (dto.check_out_date && !validTripDate(dto.check_out_date))
    )
      throw new BadRequestException({
        code: "STAY_DATES_INVALID",
        params: {},
        message: "Ngày nhận/trả phòng không hợp lệ.",
      });
    const nights =
      dto.check_in_date && dto.check_out_date
        ? Math.round(
            (Date.parse(dto.check_out_date) - Date.parse(dto.check_in_date)) /
              86400000,
          )
        : 0;
    if (nights < 0 || nights > 365)
      throw new BadRequestException({
        code: "STAY_LENGTH_INVALID",
        params: {},
        message: "Ngày trả phòng phải sau ngày nhận phòng, tối đa 365 đêm.",
      });
    if (
      dto.booking_status === "booked" &&
      (!dto.booking_provider ||
        !dto.check_in_date ||
        !dto.check_out_date ||
        !nights)
    )
      throw new BadRequestException({
        code: "BOOKING_DETAILS_REQUIRED",
        params: {},
        message: "Xác nhận đã đặt cần nhà cung cấp và ngày nhận/trả phòng.",
      });
    if (dto.booking_url && !/^https?:\/\//i.test(dto.booking_url))
      throw new BadRequestException({
        code: "BOOKING_LINK_INVALID",
        params: {},
        message: "Liên kết đặt phòng không hợp lệ.",
      });
    const args = [
      tripId,
      dto.name,
      dto.city,
      dto.rooms,
      dto.guests,
      dto.check_in_date ?? null,
      dto.check_out_date ?? null,
      nights,
      dto.price_per_night ?? null,
      dto.price_per_night === undefined
        ? null
        : dto.price_per_night * dto.rooms * nights,
      dto.currency,
      dto.booking_status,
      dto.booking_provider ?? null,
      dto.booking_reference ?? null,
      dto.room_type ?? null,
      dto.cancellation_policy ?? null,
      dto.booking_url ?? null,
      dto.locked || dto.booking_status === "booked",
      userId,
    ];
    if (id) {
      if (!dto.version)
        throw new BadRequestException({
          code: "STAY_VERSION_REQUIRED",
          params: {},
          message: "Cần phiên bản phòng để cập nhật.",
        });
      const update = await this.sql.query<{ id: string }>(
        `update accommodations set name=$2,city=$3,rooms=$4,guests=$5,check_in_date=$6,check_out_date=$7,nights=$8,
        price_per_night=$9,total_price=$10,currency=$11,booking_status=$12,booking_provider=$13,booking_reference=$14,room_type=$15,cancellation_policy=$16,booking_url=$17,
        locked_at=case when $18 then now() else null end,version=version+1 where trip_id=$1 and id=$20 and version=$21
        and (created_by_user_id=$19 or $22::boolean) returning id::text`,
        [...args, id, dto.version, ["host", "co_host"].includes(member.role)],
      );
      if (!update.rows[0])
        throw new ConflictException({
          code: "STAY_CONFLICT",
          params: {},
          message: "Phòng đã thay đổi hoặc bạn không có quyền sửa mục này.",
        });
    } else {
      await this.sql.query(
        `insert into accommodations(trip_id,name,city,rooms,guests,check_in_date,check_out_date,nights,price_per_night,total_price,currency,booking_status,booking_provider,booking_reference,room_type,cancellation_policy,booking_url,locked_at,created_by_user_id)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,case when $18 then now() else null end,$19)`,
        args,
      );
    }
    return this.listStays(tripId, userId);
  }
  async getPlan(tripId: string, userId: string): Promise<Itinerary> {
    const result = await this.sql.query<TripPlan>(
      `select t.current_plan,i.result as original,t.planning_version,t.planning_locked_ids,tm.role from trips t
      join trip_members tm on tm.trip_id=t.id and tm.user_id=$2 and tm.status='active'
      join itineraries i on i.id=t.source_itinerary_id where t.id=$1`,
      [tripId, userId],
    );
    const row = result.rows[0];
    if (!row)
      throw new NotFoundException({
        code: "PLAN_NOT_FOUND",
        params: {},
        message: "Chưa có lịch trình cho chuyến đi.",
      });
    const plan = {
      ...upgradeJourneyPlan(row.current_plan ?? row.original),
      version: row.planning_version,
      locked_ids: row.planning_locked_ids,
    };
    const schedule = await this.sql.query<{
      id: string;
      source_plan_item_id: string | null;
      title: string;
      category: string;
      scheduled_at: string | null;
      estimated_cost: number | null;
      currency: string;
      status: string;
    }>(
      `select id::text,source_plan_item_id,title,category,scheduled_at::text,estimated_cost::float8,currency,status from trip_activities where trip_id=$1 order by scheduled_at nulls last,created_at`,
      [tripId],
    );
    for (const entry of schedule.rows) {
      const originDay = plan.days.find((d) =>
        d.activities.some(
          (a) => a.id === entry.source_plan_item_id || a.id === entry.id,
        ),
      );
      const old = originDay?.activities.find(
        (a) => a.id === entry.source_plan_item_id || a.id === entry.id,
      );
      if (originDay)
        originDay.activities = originDay.activities.filter((a) => a !== old);
      if (entry.status === "cancelled" || entry.status === "rejected") continue;
      const local = entry.scheduled_at
        ? new Date(entry.scheduled_at).toLocaleString("sv-SE", {
            timeZone: "Asia/Ho_Chi_Minh",
          })
        : null;
      const day =
        (local
          ? plan.days.find((d) => d.date.slice(0, 10) === local.slice(0, 10))
          : originDay) ?? plan.days[0];
      if (!day) continue;
      const kind =
        entry.category === "cafe"
          ? "cafe"
          : entry.category === "meal" || entry.category === "food"
            ? "meal"
            : entry.category === "transport"
              ? "transfer"
              : (old?.kind ?? "visit");
      day.activities.push({
        ...old,
        id: entry.source_plan_item_id ?? entry.id,
        name: entry.title,
        category:
          kind === "meal" || kind === "cafe"
            ? "food"
            : (old?.category ?? "attraction"),
        kind,
        description: old?.description ?? "Mục do thành viên thêm vào lịch.",
        time: local?.slice(11, 16) ?? old?.time ?? "",
        duration: old?.duration ?? "",
        cost: entry.estimated_cost,
        currency: entry.currency,
        maps_link: old?.maps_link ?? "",
        evidence: old?.evidence ?? { source: "user" },
      });
      day.activities.sort((a, b) => a.time.localeCompare(b.time));
    }
    if (plan.planning) {
      const current = plan.planning;
      const endpoint = current.journey.return_to_origin
        ? current.journey.origin.label
        : current.journey.endpoint?.label;
      const fixed = await this.sql.query<{
        origin_name: string;
        destination_name: string;
        arrival_at: string | null;
        departure_at: string | null;
        mode: string;
      }>(
        `select origin_name,destination_name,arrival_at::text,departure_at::text,mode from transport_bookings where trip_id=$1 and booking_status in ('reserved','ticketed','completed') order by updated_at desc`,
        [tripId],
      );
      const outbound = fixed.rows.find(
        (t) => t.origin_name === current.journey.origin.label,
      );
      const returning = fixed.rows.find((t) => t.destination_name === endpoint);
      if (outbound || returning)
        plan.planning = {
          ...current,
          transport_preferences: {
            ...current.transport_preferences,
            ...(outbound?.arrival_at
              ? { arrival_at: new Date(outbound.arrival_at).toISOString() }
              : {}),
            ...(returning?.departure_at
              ? { departure_at: new Date(returning.departure_at).toISOString() }
              : {}),
            ...(returning?.mode === "flight" || outbound?.mode === "flight"
              ? { mode: "flight" }
              : {}),
            confirmed: true,
          },
        };
    }
    const stays = await this.listStays(tripId, userId);
    const activeStays = stays.filter((s) =>
      ["selected", "booked", "completed"].includes(s.booking_status),
    );
    if (plan.planning && activeStays.length) {
      plan.planning = {
        ...plan.planning,
        stay_preferences: {
          ...plan.planning.stay_preferences,
          booked_name: activeStays
            .map(
              (s) =>
                `${s.name} (${s.city}, ${s.check_in_date ?? "?"} → ${s.check_out_date ?? "?"})`,
            )
            .join("; "),
        },
      };
      plan.issues = [
        ...(plan.issues ?? []).filter((i) => i.code !== "STAY_NOT_SELECTED"),
        {
          code: "STAY_ROUTE_RECHECK",
          severity: "warning",
          message:
            "Chỗ ở đã chọn là điểm neo; kiểm tra tuyến và thời gian di chuyển khi đổi phòng.",
        },
      ];
      // Reprice only when all overnight cities have a selected, fully-priced stay.
      const overnightCities = [
        ...new Set(
          plan.days.slice(0, -1).map((d) => d.city.toLocaleLowerCase()),
        ),
      ];
      const covered = overnightCities.every((city) =>
        activeStays.some(
          (s) =>
            s.city.toLocaleLowerCase() === city &&
            s.total_price !== null &&
            s.nights > 0,
        ),
      );
      if (covered && overnightCities.length && plan.budget_breakdown) {
        const value = activeStays.reduce(
          (sum, s) => sum + (s.total_price ?? 0),
          0,
        );
        const delta = value - plan.budget_breakdown.accommodation;
        plan.budget_breakdown = {
          ...plan.budget_breakdown,
          accommodation: value,
          total: plan.total_cost + delta,
          per_day: (plan.total_cost + delta) / plan.num_days,
          per_person: (plan.total_cost + delta) / plan.num_travelers,
        };
        plan.total_cost += delta;
      } else
        plan.issues.push({
          code: "STAY_COST_INCOMPLETE",
          severity: "warning",
          message:
            "Giá phòng đã chọn chưa đủ cho toàn bộ các đêm; tổng ngân sách phòng vẫn là ước tính.",
        });
    }
    return this.itineraries.refreshPresentation(plan);
  }
  async lockPlan(
    tripId: string,
    userId: string,
    expectedVersion: number,
    ids: string[],
  ) {
    await this.member(tripId, userId, true);
    const result = await this.sql.query(
      `update trips set planning_locked_ids=$3,planning_version=planning_version+1 where id=$1 and planning_version=$2 returning planning_version`,
      [tripId, expectedVersion, ids],
    );
    if (!result.rows.length)
      throw new ConflictException({
        code: "PLAN_CHANGED",
        params: {},
        message: "Lịch trình đã thay đổi. Vui lòng tải lại.",
      });
    return this.getPlan(tripId, userId);
  }
  async enqueueRevision(tripId: string, userId: string, dto: RevisionDto) {
    await this.member(tripId, userId, true);
    const plan = await this.getPlan(tripId, userId);
    if (plan.version !== dto.expected_version)
      throw new ConflictException({
        code: "PLAN_CHANGED",
        params: {},
        message: "Lịch trình đã thay đổi. Vui lòng tải lại.",
      });
    if (dto.scope !== "restore" && !dto.target_id)
      throw new BadRequestException({
        code: "REVISION_TARGET_REQUIRED",
        params: {},
        message: "Chọn mục cần tạo lại.",
      });
    const id = await this.admitJob(userId, "revision", {
      tripId,
      revision: dto,
    });
    return { job_id: id, status: "queued" };
  }
  private async buildRevision(
    userId: string,
    tripId: string,
    dto: RevisionDto,
  ) {
    await this.member(tripId, userId, true);
    const before = await this.getPlan(tripId, userId);
    if (before.version !== dto.expected_version)
      throw new ConflictException({
        code: "TRANSLATION_SOURCE_CHANGED",
        params: {},
        message: "Bản gốc đã thay đổi.",
      });
    let candidate: Itinerary;
    if (dto.scope === "restore") {
      const old = await this.sql.query<{ previous_plan: Itinerary }>(
        `select previous_plan from trip_plan_revisions where trip_id=$1 and id=$2 and status='applied'`,
        [tripId, dto.restore_revision_id],
      );
      if (!old.rows[0])
        throw new NotFoundException({
          code: "REVISION_NOT_FOUND",
          params: {},
          message: "Không tìm thấy phiên bản cũ.",
        });
      candidate = old.rows[0].previous_plan;
    } else {
      if (!before.planning)
        throw new BadRequestException({
          code: "LEGACY_REGENERATION_REQUIRED",
          params: {},
          message:
            "Lịch trình cũ cần tạo lại với tiêu chí mới trước khi chỉnh từng phần.",
        });
      if (!before.locale)
        throw new BadRequestException({
          code: "SOURCE_LOCALE_UNKNOWN",
          message:
            "The source language is unknown. Create a new itinerary before regenerating sections.",
        });
      const locks = new Set(before.locked_ids ?? []);
      if (locks.has(dto.target_id!))
        throw new BadRequestException({
          code: "ITEM_LOCKED",
          params: {},
          message: "Mục này đang được khóa.",
        });
      const stays = (await this.listStays(tripId, userId)).filter(
        (s) => s.booking_status !== "cancelled",
      );
      const transport = await this.sql.query(
        `select mode,origin_name,destination_name,departure_at,arrival_at,booking_status from transport_bookings where trip_id=$1 and booking_status in ('reserved','ticketed','completed')`,
        [tripId],
      );
      const result = await this.itineraries.generate({
        userId,
        dto: {
          cities: before.planning.journey.destinations,
          planning: before.planning,
          num_days: before.num_days,
          start_date: before.days[0]?.date?.slice(0, 10) || undefined,
          end_date: before.days.at(-1)?.date?.slice(0, 10) || undefined,
          num_travelers: before.num_travelers,
          budget: before.planning.budget.total,
          currency: before.currency,
          trip_style: before.trip_style ?? "mixed",
          locale: before.locale ?? "en",
          force_refresh: true,
          prompt_text: `Chỉnh ${dto.scope} ${dto.target_id}: ${dto.instruction}. Giữ các mốc đã xác nhận: ${JSON.stringify({ stays: stays.filter((s) => s.locked), transport: transport.rows })}. Lịch gốc: ${JSON.stringify(before.days)}.`,
        },
      });
      if (result.status !== "cached" || !result.result)
        throw new Error("Không tạo được phương án thay thế.");
      const generated = upgradeJourneyPlan(result.result as Itinerary);
      candidate = structuredClone(before);
      if (dto.scope === "day") {
        const index = candidate.days.findIndex((d) => d.id === dto.target_id);
        if (index < 0)
          throw new BadRequestException({
            code: "DAY_NOT_FOUND",
            params: {},
            message: "Không tìm thấy ngày.",
          });
        const replacement = generated.days.find(
          (d) => d.day_number === candidate.days[index]!.day_number,
        );
        if (!replacement)
          throw new BadRequestException({
            code: "REPLACEMENT_DAY_MISSING",
            params: {},
            message: "Thiếu ngày thay thế.",
          });
        const fixed = candidate.days[index]!.activities.filter(
          (a) =>
            locks.has(a.id!) ||
            a.locked ||
            (a.kind === "transfer" &&
              (before.planning!.transport_preferences.confirmed ||
                transport.rows.length > 0)) ||
            ((a.kind === "check_in" || a.kind === "check_out") &&
              stays.some((s) => s.locked)),
        );
        candidate.days[index] = {
          ...replacement,
          id: candidate.days[index]!.id,
          activities: [
            ...replacement.activities.filter(
              (a) => !fixed.some((f) => f.name === a.name),
            ),
            ...fixed,
          ].sort((a, b) => a.time.localeCompare(b.time)),
        };
      } else if (dto.scope === "meal") {
        const day = candidate.days.find((d) =>
          d.activities.some((a) => a.id === dto.target_id),
        );
        const index =
          day?.activities.findIndex((a) => a.id === dto.target_id) ?? -1;
        if (!day || index < 0)
          throw new BadRequestException({
            code: "MEAL_NOT_FOUND",
            params: {},
            message: "Không tìm thấy bữa ăn/café.",
          });
        const original = day.activities[index]!;
        if (original.kind !== "meal" && original.kind !== "cafe")
          throw new BadRequestException({
            code: "ITEM_NOT_MEAL",
            params: {},
            message: "Mục này không phải bữa ăn/café.",
          });
        const choices =
          generated.days
            .find((d) => d.day_number === day.day_number)
            ?.activities.filter((a) => a.kind === original.kind) ?? [];
        const replacement =
          choices.find((a) => a.time === original.time) ?? choices[0];
        if (!replacement)
          throw new BadRequestException({
            code: "REPLACEMENT_MEAL_MISSING",
            params: {},
            message: "Chưa có quán thay thế phù hợp.",
          });
        day.activities[index] = {
          ...replacement,
          id: original.id,
          time: original.time,
        };
      } else {
        const hotel = before.hotels.find((h) => h.id === dto.target_id);
        if (!hotel)
          throw new BadRequestException({
            code: "STAY_NOT_FOUND",
            params: {},
            message: "Không tìm thấy chỗ ở.",
          });
        if (stays.some((s) => s.name === hotel.name && s.locked))
          throw new BadRequestException({
            code: "STAY_LOCKED",
            params: {},
            message: "Chỗ ở đã đặt/khóa không thể tự thay.",
          });
        const replacement = generated.hotels.find((h) => h.city === hotel.city);
        if (!replacement)
          throw new BadRequestException({
            code: "REPLACEMENT_STAY_MISSING",
            params: {},
            message: "Chưa có chỗ ở thay thế.",
          });
        candidate.hotels = candidate.hotels.map((h) =>
          h.id === hotel.id ? { ...replacement, id: hotel.id } : h,
        );
      }
      // Recalculate the changed day cost only; lodging alternatives never all count as booked spend.
      const oldCost = before.days.reduce(
        (n, d) => n + d.activities.reduce((s, a) => s + (a.cost ?? 0), 0),
        0,
      );
      const newCost = candidate.days.reduce(
        (n, d) => n + d.activities.reduce((s, a) => s + (a.cost ?? 0), 0),
        0,
      );
      candidate.total_cost = before.total_cost + newCost - oldCost;
      if (candidate.budget_breakdown) {
        const categoryTotal = (value: Itinerary, kinds: string[]) =>
          value.days
            .flatMap((d) => d.activities)
            .filter((a) => kinds.includes(a.kind ?? "visit"))
            .reduce((n, a) => n + (a.cost ?? 0), 0);
        const b = { ...candidate.budget_breakdown };
        b.food +=
          categoryTotal(candidate, ["meal", "cafe"]) -
          categoryTotal(before, ["meal", "cafe"]);
        b.transport +=
          categoryTotal(candidate, ["transfer"]) -
          categoryTotal(before, ["transfer"]);
        b.activities +=
          categoryTotal(candidate, ["visit", "rest"]) -
          categoryTotal(before, ["visit", "rest"]);
        b.accommodation +=
          categoryTotal(candidate, ["check_in", "check_out"]) -
          categoryTotal(before, ["check_in", "check_out"]);
        b.total = candidate.total_cost;
        b.per_person = b.total / candidate.num_travelers;
        b.per_day = b.total / candidate.num_days;
        candidate.budget_breakdown = b;
      }
      candidate = upgradeJourneyPlan(candidate, {
        cities: before.planning.journey.destinations,
        planning: before.planning,
        currency: before.currency,
        locale: before.locale ?? "en",
        trip_style: before.trip_style ?? "mixed",
        num_days: before.num_days,
        num_travelers: before.num_travelers,
      });
    }
    candidate.planning = before.planning;
    // A restore also preserves explicit locks, never silently overwrites them.
    for (const day of before.days)
      for (const activity of day.activities)
        if (
          (before.locked_ids ?? []).includes(activity.id!) ||
          activity.locked
        ) {
          const target = candidate.days.find((d) => d.id === day.id);
          if (!target)
            throw new BadRequestException({
              code: "LOCKED_DAY_MISSING",
              params: {},
              message: "Phiên bản cũ thiếu ngày có mục đang khóa.",
            });
          target.activities = target.activities.filter(
            (a) => a.id !== activity.id,
          );
          target.activities.push(activity);
          target.activities.sort((a, b) => a.time.localeCompare(b.time));
        }
    // Recheck after reinserting locked entries; a generated replacement must fit them.
    if (candidate.planning)
      candidate = upgradeJourneyPlan(candidate, {
        cities: candidate.planning.journey.destinations,
        planning: candidate.planning,
        currency: candidate.currency,
        locale: before.locale ?? "en",
        trip_style: before.trip_style ?? "mixed",
        num_days: candidate.num_days,
        num_travelers: candidate.num_travelers,
      });
    const oldItems = before.days.flatMap((d) => d.activities),
      newItems = candidate.days.flatMap((d) => d.activities);
    const diff = {
      added: newItems
        .filter((n) => !oldItems.some((o) => o.id === n.id))
        .map((a) => a.name),
      removed: oldItems
        .filter((o) => !newItems.some((n) => n.id === o.id))
        .map((a) => a.name),
      changed: newItems
        .filter((n) =>
          oldItems.some(
            (o) => o.id === n.id && JSON.stringify(o) !== JSON.stringify(n),
          ),
        )
        .map((a) => a.name),
      cost_delta: candidate.total_cost - before.total_cost,
    };
    if (JSON.stringify(before.hotels) !== JSON.stringify(candidate.hotels))
      diff.changed.push(
        "Lựa chọn lưu trú; cần kiểm tra lại tuyến từ chỗ ở mới.",
      );
    const saved = await this.sql.query<{ id: string }>(
      `insert into trip_plan_revisions(trip_id,user_id,base_version,previous_plan,candidate,diff,instruction,scope) values($1,$2,$3,$4,$5,$6,$7,$8) returning id::text`,
      [
        tripId,
        userId,
        before.version,
        before,
        candidate,
        diff,
        dto.instruction ?? null,
        dto.scope,
      ],
    );
    return saved.rows[0]!.id;
  }
  async revisions(tripId: string, userId: string) {
    await this.member(tripId, userId);
    return (
      await this.sql.query<PlanRevision>(
        `select id::text,base_version,status,candidate,diff from trip_plan_revisions where trip_id=$1 order by created_at desc limit 20`,
        [tripId],
      )
    ).rows;
  }
  async applyRevision(
    tripId: string,
    userId: string,
    revisionId: string,
    version: number,
  ) {
    const member = await this.member(tripId, userId, true);
    if (!["host", "co_host"].includes(member.role))
      throw new ForbiddenException({
        code: "APPLY_HOST_ONLY",
        params: {},
        message: "Chủ chuyến hoặc đồng chủ chuyến mới được áp dụng phương án.",
      });
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const active = await client.query(
        `select role from trip_members where trip_id=$1 and user_id=$2 and status='active' and role in ('host','co_host') for share`,
        [tripId, userId],
      );
      if (!active.rows.length)
        throw new ForbiddenException({
          code: "APPLY_PERMISSION_CHANGED",
          params: {},
          message: "Quyền áp dụng phương án đã thay đổi.",
        });
      const locked = await client.query(
        `select planning_version from trips where id=$1 for update`,
        [tripId],
      );
      if (locked.rows[0]?.planning_version !== version)
        throw new ConflictException({
          code: "PLAN_CHANGED",
          params: {},
          message: "Lịch trình đã thay đổi. Vui lòng tải lại.",
        });
      const revision = await client.query<{
        candidate: Itinerary;
        previous_plan: Itinerary;
      }>(
        `select candidate,previous_plan from trip_plan_revisions where id=$1 and trip_id=$2 and base_version=$3 and status='preview' and (user_id=$4 or $5::boolean) for update`,
        [
          revisionId,
          tripId,
          version,
          userId,
          ["host", "co_host"].includes(member.role),
        ],
      );
      const candidate = revision.rows[0]?.candidate;
      if (!candidate)
        throw new ConflictException({
          code: "REVISION_UNAVAILABLE",
          params: {},
          message: "Bản xem trước đã áp dụng hoặc không còn hợp lệ.",
        });
      if (candidate.issues?.some((i) => i.severity === "error"))
        throw new BadRequestException({
          code: "REVISION_INVALID",
          params: {},
          message:
            "Phương án còn lỗi thời gian hoặc ràng buộc; hãy tạo lại trước khi áp dụng.",
        });
      const hasSchedule = await client.query(
        `select 1 from trip_activities where trip_id=$1 limit 1`,
        [tripId],
      );
      if (hasSchedule.rows.length) {
        const ids = candidate.days.flatMap((d) =>
          d.activities.map((a) => a.id!),
        );
        await client.query(
          `update trip_activities set status='cancelled',updated_at=now() where trip_id=$1 and source_plan_item_id is not null and not(source_plan_item_id=any($2::text[]))`,
          [tripId, ids],
        );
        const removedManual = (revision.rows[0]?.previous_plan.days ?? [])
          .flatMap((d) => d.activities)
          .map((a) => a.id!)
          .filter(
            (id) =>
              /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id) && !ids.includes(id),
          );
        if (removedManual.length)
          await client.query(
            `update trip_activities set status='cancelled',updated_at=now() where trip_id=$1 and id::text=any($2::text[]) and source_plan_item_id is null`,
            [tripId, removedManual],
          );
        for (const day of candidate.days)
          for (const a of day.activities) {
            const scheduled =
              /^\d{2}:\d{2}$/.test(a.time) && day.date
                ? `${day.date.slice(0, 10)}T${a.time}:00+07:00`
                : null;
            if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(a.id ?? "")) {
              const manual = await client.query(
                `update trip_activities set title=$3,category=$4,scheduled_at=$5,estimated_cost=$6,status=case when status='cancelled' then 'approved' else status end,updated_at=now() where trip_id=$1 and id::text=$2 and source_plan_item_id is null returning id`,
                [tripId, a.id, a.name, a.kind ?? a.category, scheduled, a.cost],
              );
              if (manual.rows.length) continue;
            }
            await client.query(
              `insert into trip_activities(trip_id,title,category,scheduled_at,estimated_cost,currency,created_by_user_id,status,source_plan_item_id)
            values($1,$2,$3,$4,$5,$6,$7,'approved',$8)
            on conflict(trip_id,source_plan_item_id) where source_plan_item_id is not null do update
            set title=excluded.title,category=excluded.category,scheduled_at=excluded.scheduled_at,estimated_cost=excluded.estimated_cost,currency=excluded.currency,status=case when trip_activities.status='cancelled' then 'approved' else trip_activities.status end,updated_at=now()
            where trip_activities.status <> 'pending_review'`,
              [
                tripId,
                a.name,
                a.kind ?? a.category,
                scheduled,
                a.cost,
                a.currency,
                userId,
                a.id,
              ],
            );
          }
      }
      await client.query(
        `update trips set current_plan=$2,planning_version=planning_version+1,updated_at=now() where id=$1`,
        [tripId, candidate],
      );
      await client.query(
        `update trip_plan_revisions set status='applied',applied_at=now() where id=$1`,
        [revisionId],
      );
      await client.query(
        `insert into audit_logs(trip_id,actor_user_id,entity_type,entity_id,action) values($1,$2,'itinerary_revision',$3,'applied')`,
        [tripId, userId, revisionId],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    await this.seedChecklist(tripId, userId);
    return this.getPlan(tripId, userId);
  }
  async seedInitialBookings(tripId: string, userId: string) {
    const plan = await this.getPlan(tripId, userId),
      p = plan.planning;
    if (!p) return;
    if (p.transport_preferences.confirmed) {
      const t = p.transport_preferences,
        origin = p.journey.origin.label,
        end = p.journey.return_to_origin
          ? origin
          : (p.journey.endpoint?.label ?? "");
      const legs = [
        {
          from: origin,
          to: plan.days[0]?.city ?? "",
          arrival: t.arrival_at,
          departure: undefined,
          price: t.total_price,
        },
        {
          from: plan.days.at(-1)?.city ?? "",
          to: end,
          arrival: undefined,
          departure: t.departure_at,
          price: undefined,
        },
      ];
      for (const [index, leg] of legs.entries())
        await this.sql.query(
          `insert into transport_bookings(trip_id,mode,provider_name,booking_reference,origin_name,destination_name,departure_at,arrival_at,price,currency,booking_status,notes,created_by_user_id)
        select $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ticketed',$11,$12 where not exists(select 1 from transport_bookings where trip_id=$1 and notes=$11)`,
          [
            tripId,
            t.mode === "suggest" ? "other" : t.mode,
            t.provider ?? null,
            t.booking_reference ?? null,
            leg.from,
            leg.to,
            leg.departure
              ? localTripInstant(leg.departure) === null
                ? null
                : new Date(localTripInstant(leg.departure)!).toISOString()
              : null,
            leg.arrival
              ? new Date(localTripInstant(leg.arrival)!).toISOString()
              : null,
            leg.price ?? null,
            plan.currency,
            `Mốc vé từ yêu cầu ban đầu: ${index === 0 ? "đi (giá tổng vé nhóm nếu có)" : "về"}.`,
            userId,
          ],
        );
    }
    const stay = p.stay_preferences;
    if (
      stay.type === "already_booked" &&
      stay.booked_name &&
      stay.check_in &&
      stay.check_out
    ) {
      const existing = await this.sql.query(
        `select id from accommodations where trip_id=$1 and name=$2`,
        [tripId, stay.booked_name],
      );
      if (!existing.rows.length)
        await this.saveStay(tripId, userId, {
          name: stay.booked_name,
          city: plan.days[0]?.city ?? "",
          rooms: stay.rooms,
          guests: plan.num_travelers,
          check_in_date: stay.check_in,
          check_out_date: stay.check_out,
          price_per_night: stay.nightly_budget,
          currency: plan.currency,
          booking_status: "booked",
          booking_provider: "Người dùng cung cấp",
          booking_reference: stay.booking_reference,
          locked: true,
        });
    }
  }
  async seedChecklist(tripId: string, userId: string) {
    const plan = await this.getPlan(tripId, userId);
    for (const issue of plan.issues ?? [])
      await this.sql.query(
        `insert into trip_checklist_items(trip_id,title,category,status,created_by_user_id) values($1,$2,'general','todo',$3) on conflict(trip_id,title) do nothing`,
        [tripId, issue.message, userId],
      );
  }
  async checklist(tripId: string, userId: string) {
    await this.member(tripId, userId);
    return (
      await this.sql.query(
        `select id::text,title,status from trip_checklist_items where trip_id=$1 order by created_at`,
        [tripId],
      )
    ).rows;
  }
  async updateChecklist(
    tripId: string,
    userId: string,
    id: string,
    status: string,
  ) {
    await this.member(tripId, userId, true);
    const saved = await this.sql.query(
      `update trip_checklist_items set status=$4,updated_by_user_id=$3,updated_at=now() where trip_id=$1 and id=$2 returning id`,
      [tripId, id, userId, status],
    );
    if (!saved.rows.length)
      throw new NotFoundException({
        code: "CHECKLIST_NOT_FOUND",
        params: {},
        message: "Không tìm thấy việc cần làm.",
      });
    return this.checklist(tripId, userId);
  }
}
