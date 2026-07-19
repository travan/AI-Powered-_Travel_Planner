import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { billService } from "../../application/bill.service.js";
import {
  billIdParamsDto,
  createBillUploadDto,
  createBillUploadParamsDto,
  type CreateBillUploadDto,
} from "../../dto/bill.dto.js";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { ZodValidationPipe } from "../../../../shared/nest/zod-validation.pipe.js";

@Controller("api")
@UseGuards(JwtAuthGuard)
export class BillsController {
  @Post("trips/:id/bills")
  async create(
    @Param(new ZodValidationPipe(createBillUploadParamsDto)) params: { id: string },
    @Body(new ZodValidationPipe(createBillUploadDto)) dto: CreateBillUploadDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await billService.create({ tripId: params.id, userId: user.sub, dto });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get("bills/:id")
  async getById(@Param(new ZodValidationPipe(billIdParamsDto)) params: { id: string }) {
    const result = await billService.getById(params.id);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
