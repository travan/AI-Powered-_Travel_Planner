import { Inject, Injectable, OnApplicationShutdown } from "@nestjs/common";
import type { MongoClient } from "mongodb";
import type { Pool } from "pg";
import { MONGO_CLIENT, POSTGRES_POOL } from "./database.tokens.js";

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  constructor(
    @Inject(POSTGRES_POOL) private readonly postgres: Pool,
    @Inject(MONGO_CLIENT) private readonly mongo: MongoClient | null
  ) {}

  async onApplicationShutdown() {
    await Promise.allSettled([this.postgres.end(), this.mongo?.close()]);
  }
}
