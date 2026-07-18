import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { TransportService } from "./application/transport.service.js";
import { TRANSPORT_REPOSITORY } from "./domain/transport.repository.js";
import { PostgresTransportRepository } from "./infrastructure/postgres-transport.repository.js";
import { TransportController } from "./interfaces/http/transport.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [TransportController],
  providers: [
    TransportService,
    {
      provide: TRANSPORT_REPOSITORY,
      useClass: PostgresTransportRepository,
    },
  ],
  exports: [TransportService],
})
export class TransportModule {}
