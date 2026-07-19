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
      useClass: MongoUserPromptHistoryRepository,
    },
  ],
  exports: [UsersService],
})
export class UsersModule {}
