import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { RecommendationsService } from "./application/recommendations.service.js";
import { RECOMMENDATION_REPOSITORY } from "./domain/recommendation.repository.js";
import { PostgresRecommendationRepository } from "./infrastructure/postgres-recommendation.repository.js";
import { RecommendationsController } from "./interfaces/http/recommendations.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [RecommendationsController],
  providers: [
    RecommendationsService,
    {
      provide: RECOMMENDATION_REPOSITORY,
      useClass: PostgresRecommendationRepository,
    },
  ],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
