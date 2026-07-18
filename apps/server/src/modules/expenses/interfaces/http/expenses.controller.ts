import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { ExpensesService } from "../../application/expenses.service.js";
import {
  CreateExpenseDto,
  ExpenseParamsDto,
  ExpenseSplitParamsDto,
  ExpenseTripParamsDto,
  UpdateExpenseDto,
  UpdateExpenseSplitStatusDto,
} from "../../dto/expense.dto.js";

@Controller("api/trips/:tripId/expenses")
@UseGuards(JwtAuthGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  async list(@Param() params: ExpenseTripParamsDto, @CurrentUser() user: CurrentUserValue) {
    const result = await this.expenses.listForTrip({ tripId: params.tripId, actorUserId: user.sub });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post()
  async create(
    @Param() params: ExpenseTripParamsDto,
    @Body() dto: CreateExpenseDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.expenses.create({ tripId: params.tripId, actorUserId: user.sub, dto });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Patch(":expenseId")
  async update(
    @Param() params: ExpenseParamsDto,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.expenses.update({
      tripId: params.tripId,
      expenseId: params.expenseId,
      actorUserId: user.sub,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Patch(":expenseId/splits/:splitId")
  async updateSplitStatus(
    @Param() params: ExpenseSplitParamsDto,
    @Body() dto: UpdateExpenseSplitStatusDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.expenses.updateSplitStatus({
      tripId: params.tripId,
      expenseId: params.expenseId,
      splitId: params.splitId,
      actorUserId: user.sub,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
