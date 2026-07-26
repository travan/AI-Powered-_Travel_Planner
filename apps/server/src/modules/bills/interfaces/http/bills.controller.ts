import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { BillsService } from "../../application/bills.service.js";
import { BillIdParamsDto, BillTripParamsDto, CreateBillDto, UpdateBillDto } from "../../dto/bill.dto.js";

@Controller("api")
@UseGuards(JwtAuthGuard)
export class BillsController {
  constructor(@Inject(BillsService) private readonly bills: BillsService) {}

  @Get("bills/:id")
  async getById(@Param() params: BillIdParamsDto, @CurrentUser() user: CurrentUserValue) {
    const result = await this.bills.getById(params.id, user.sub);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post("trips/:tripId/bills")
  async create(
    @Param() params: BillTripParamsDto,
    @Body() dto: CreateBillDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.bills.create({ tripId: params.tripId, actorUserId: user.sub, dto });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Patch("bills/:id")
  async update(
    @Param() params: BillIdParamsDto,
    @Body() dto: UpdateBillDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.bills.update({ billId: params.id, actorUserId: user.sub, dto });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post("bills/:id/analyze")
  async analyze(@Param() params: BillIdParamsDto, @CurrentUser() user: CurrentUserValue) {
    const result = await this.bills.analyze({ billId: params.id, actorUserId: user.sub });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
