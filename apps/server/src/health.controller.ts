import { Controller, Get, Inject } from "@nestjs/common";
import type { MongoClient } from "mongodb";
import type { Pool } from "pg";
import { MONGO_CLIENT, POSTGRES_POOL } from "./database/database.tokens.js";

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
      ...(process.env.DEPLOY_COMMIT
        ? { deploy_commit: process.env.DEPLOY_COMMIT }
        : {}),
      services: {
        postgres: "ok",
        ...(this.mongo ? { mongo: "ok" } : { documents: "postgres" }),
      },
      timestamp: new Date().toISOString(),
    };
  }
}
