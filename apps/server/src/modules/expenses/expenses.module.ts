import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { ExpensesService } from "./application/expenses.service.js";
import { EXPENSE_REPOSITORY } from "./domain/expense.repository.js";
import { PostgresExpenseRepository } from "./infrastructure/postgres-expense.repository.js";
import { ExpensesController } from "./interfaces/http/expenses.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [ExpensesController],
  providers: [
    ExpensesService,
    {
      provide: EXPENSE_REPOSITORY,
      useClass: PostgresExpenseRepository,
    },
  ],
  exports: [ExpensesService],
})
export class ExpensesModule {}
