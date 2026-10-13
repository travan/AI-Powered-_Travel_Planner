import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { CityCatalogWorker } from "./application/city-catalog.worker.js";
import { CitiesService } from "./application/cities.service.js";
import { CITY_REPOSITORY } from "./domain/city.repository.js";
import { PostgresCityRepository } from "./infrastructure/postgres-city.repository.js";
import { CitiesController } from "./interfaces/http/cities.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [CitiesController],
  providers: [
    CitiesService,
    CityCatalogWorker,
    {
      provide: CITY_REPOSITORY,
      useClass: PostgresCityRepository,
    },
  ],
  exports: [CitiesService, CityCatalogWorker],
})
export class CitiesModule {}
