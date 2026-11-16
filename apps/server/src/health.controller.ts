import { Controller, Get, Inject } from "@nestjs/common";
import type { MongoClient } from "mongodb";
import type { Pool } from "pg";
import { MONGO_CLIENT, POSTGRES_POOL } from "./database/database.tokens.js";
import { workerRequestContext } from "./cloudflare/request-context.js";

@Controller()
export class HealthController {
  constructor(
    @Inject(POSTGRES_POOL) private readonly postgres: Pool,
    @Inject(MONGO_CLIENT) private readonly mongo: MongoClient | null,
  ) {}

  @Get("health")
  async health() {
    await this.postgres.query("select 1");
    await this.mongo?.db().admin().ping();

    return {
      status: "ok",
      ...(process.env.AI_PROVIDER === "mock" &&
      process.env.JOURNEY_STAGING_DELAY_MS === "30000"
        ? { journey_load_test: true }
        : {}),
      ...(process.env.DEPLOY_COMMIT
        ? { deploy_commit: process.env.DEPLOY_COMMIT }
        : {}),
      services: {
        postgres: "ok",
        ...(this.mongo ? { mongo: "ok" } : { documents: "postgres" }),
      },
      planning_pipeline: {
        v2_percent: Number(process.env.PLANNING_V2_PERCENT ?? 0),
        queue_bound: !!workerRequestContext.getStore()?.queue,
        ai_concurrency: Number(process.env.PLANNING_AI_CONCURRENCY ?? 1),
        staging: process.env.PLANNING_STAGING === "true",
      },
      timestamp: new Date().toISOString(),
    };
  }
}
