import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ActivitiesService } from "./application/activities.service.js";
import { ACTIVITY_REPOSITORY } from "./domain/activity.repository.js";
import { PostgresActivityRepository } from "./infrastructure/postgres-activity.repository.js";
import { ActivitiesController } from "./interfaces/http/activities.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [ActivitiesController],
  providers: [
    ActivitiesService,
    {
      provide: ACTIVITY_REPOSITORY,
      useClass: PostgresActivityRepository,
    },
  ],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
