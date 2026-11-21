import { Module } from "@nestjs/common";
import { TripInviteMailWorker } from "./application/trip-invite-mail.worker.js";
import { DatabaseModule } from "../../database/database.module.js";
import { TripsService } from "./application/trips.service.js";
import { TRIP_REPOSITORY } from "./domain/trip.repository.js";
import { PostgresTripRepository } from "./infrastructure/postgres-trip.repository.js";
import { TripsController } from "./interfaces/http/trips.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [TripsController],
  providers: [
    TripInviteMailWorker,
    TripsService,
    {
      provide: TRIP_REPOSITORY,
      useClass: PostgresTripRepository,
    },
  ],
  exports: [TripsService, TripInviteMailWorker],
})
export class TripsModule {}
