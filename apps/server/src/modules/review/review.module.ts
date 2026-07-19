import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ReviewService } from "./application/review.service.js";
import { REVIEW_REPOSITORY } from "./domain/review.repository.js";
import { PostgresReviewRepository } from "./infrastructure/postgres-review.repository.js";
import { ReviewController } from "./interfaces/http/review.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [ReviewController],
  providers: [
    ReviewService,
    {
      provide: REVIEW_REPOSITORY,
      useClass: PostgresReviewRepository,
    },
  ],
})
export class ReviewModule {}
