import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ItineraryService } from "./application/itinerary.service.js";
import { ITINERARY_REPOSITORY } from "./domain/itinerary.repository.js";
import { PostgresItineraryRepository } from "./infrastructure/postgres-itinerary.repository.js";
import { ItineraryController } from "./interfaces/http/itinerary.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [ItineraryController],
  providers: [
    ItineraryService,
    {
      provide: ITINERARY_REPOSITORY,
      useClass: PostgresItineraryRepository,
    },
  ],
  exports: [ItineraryService],
})
export class ItineraryModule {}
