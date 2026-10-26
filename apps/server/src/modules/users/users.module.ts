import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { UsersService } from "./application/users.service.js";
import {
  USER_PROFILE_REPOSITORY,
  USER_PROMPT_HISTORY_REPOSITORY,
} from "./domain/user-profile.repository.js";
import { MongoUserPromptHistoryRepository } from "./infrastructure/mongo-user-prompt-history.repository.js";
import { PostgresUserProfileRepository } from "./infrastructure/postgres-user-profile.repository.js";
import { UsersController } from "./interfaces/http/users.controller.js";
import { AppConfigService } from "../../config/app-config.service.js";
import { SQL_CLIENT, MONGO_DATABASE, type SqlClient } from "../../database/database.tokens.js";
import type { Db } from "mongodb";
import { PostgresUserPromptHistoryRepository } from "./infrastructure/postgres-user-prompt-history.repository.js";

@Module({
  imports: [DatabaseModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    {
      provide: USER_PROFILE_REPOSITORY,
      useClass: PostgresUserProfileRepository,
    },
    {
      provide: USER_PROMPT_HISTORY_REPOSITORY,
      inject: [AppConfigService, SQL_CLIENT, MONGO_DATABASE],
      useFactory: (config: AppConfigService, sql: SqlClient, mongo: Db | null) =>
        config.documentStore === "postgres"
          ? new PostgresUserPromptHistoryRepository(sql)
          : new MongoUserPromptHistoryRepository(mongo!),
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
