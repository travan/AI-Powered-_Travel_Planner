import { CurrencyService } from "./enrichment/currency.service.js";
import { CurrencyController } from "./interfaces/http/currency.controller.js";
import { PlannerLearningService } from "./learning/learning.service.js";
import { PlannerLearningController } from "./learning/learning.controller.js";
import { WeatherService } from "./enrichment/weather.service.js";
import { JourneyController } from "./journey/journey.controller.js";
import { JourneyService } from "./journey/journey.service.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { CitiesModule } from "../cities/cities.module.js";
import { ItineraryService } from "./application/itinerary.service.js";
import { ITINERARY_REPOSITORY } from "./domain/itinerary.repository.js";
import { PostgresItineraryRepository } from "./infrastructure/postgres-itinerary.repository.js";
import { ItineraryController } from "./interfaces/http/itinerary.controller.js";

@Module({
  imports: [DatabaseModule, CitiesModule],
  controllers: [
    CurrencyController,
    JourneyController,
    ItineraryController,
    PlannerLearningController,
  ],
  providers: [
    PlannerLearningService,
    CurrencyService,
    WeatherService,
    ItineraryService,
    JourneyService,
    {
      provide: ITINERARY_REPOSITORY,
      useClass: PostgresItineraryRepository,
    },
  ],
  exports: [ItineraryService, JourneyService],
})
export class ItineraryModule {}
