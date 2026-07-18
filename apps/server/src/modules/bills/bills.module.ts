import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { BillsService } from "./application/bills.service.js";
import { BILL_REPOSITORY } from "./domain/bill.repository.js";
import { PostgresBillRepository } from "./infrastructure/postgres-bill.repository.js";
import { BillsController } from "./interfaces/http/bills.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [BillsController],
  providers: [
    BillsService,
    {
      provide: BILL_REPOSITORY,
      useClass: PostgresBillRepository,
    },
  ],
  exports: [BillsService],
})
export class BillsModule {}
