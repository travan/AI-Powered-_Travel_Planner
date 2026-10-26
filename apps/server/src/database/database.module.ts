import { Global, Module } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import { MongoClient } from "mongodb";
import { Pool } from "pg";
import { AppConfigModule } from "../config/config.module.js";
import { AppConfigService } from "../config/app-config.service.js";
import { MONGO_CLIENT, MONGO_DATABASE, POSTGRES_POOL, SQL_CLIENT, SUPABASE_CLIENT } from "./database.tokens.js";
import { PostgresSqlClient } from "./postgres-sql.client.js";
import { DatabaseLifecycleService } from "./database-lifecycle.service.js";
import { workerPool } from "../cloudflare/request-context.js";

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: POSTGRES_POOL,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        process.env.RUNTIME_TARGET === "cloudflare" ? workerPool : new Pool({
          connectionString: config.postgresUrl,
          application_name: `horizon-nest-${config.databaseProvider}`,
          ...config.databasePool,
        }),
    },
    {
      provide: SQL_CLIENT,
      inject: [POSTGRES_POOL],
      useFactory: (pool: Pool) => new PostgresSqlClient(pool),
    },
    {
      provide: SUPABASE_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => {
        const supabase = config.supabaseApiConfig;
        if (!supabase) return null;
        return createClient(supabase.url, supabase.serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      },
    },
    {
      provide: MONGO_CLIENT,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => config.documentStore === "postgres" ? null : new MongoClient(config.mongo.uri),
    },
    {
      provide: MONGO_DATABASE,
      inject: [MONGO_CLIENT, AppConfigService],
      useFactory: (client: MongoClient | null, config: AppConfigService) => client?.db(config.mongo.dbName) ?? null,
    },
    DatabaseLifecycleService,
  ],
  exports: [POSTGRES_POOL, SQL_CLIENT, SUPABASE_CLIENT, MONGO_CLIENT, MONGO_DATABASE],
})
export class DatabaseModule {}
