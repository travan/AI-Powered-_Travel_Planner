import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { CitiesService } from "./application/cities.service.js";
import { CITY_REPOSITORY } from "./domain/city.repository.js";
import { PostgresCityRepository } from "./infrastructure/postgres-city.repository.js";
import { CitiesController } from "./interfaces/http/cities.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [CitiesController],
  providers: [
    CitiesService,
    {
      provide: CITY_REPOSITORY,
      useClass: PostgresCityRepository,
    },
  ],
  exports: [CitiesService],
})
export class CitiesModule {}
