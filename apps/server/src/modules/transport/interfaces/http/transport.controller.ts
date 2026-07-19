import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { TransportService } from "../../application/transport.service.js";
import {
  CreateTransportBookingDto,
  TransportBookingParamsDto,
  TransportTripParamsDto,
  UpdateTransportBookingDto,
} from "../../dto/transport.dto.js";

@Controller("api/trips/:tripId/transport-bookings")
@UseGuards(JwtAuthGuard)
export class TransportController {
  constructor(private readonly transport: TransportService) {}

  @Get()
  async list(@Param() params: TransportTripParamsDto, @CurrentUser() user: CurrentUserValue) {
    const result = await this.transport.listForTrip({ tripId: params.tripId, actorUserId: user.sub });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post()
  async create(
    @Param() params: TransportTripParamsDto,
    @Body() dto: CreateTransportBookingDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.transport.create({ tripId: params.tripId, actorUserId: user.sub, dto });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Patch(":bookingId")
  async update(
    @Param() params: TransportBookingParamsDto,
    @Body() dto: UpdateTransportBookingDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.transport.update({
      tripId: params.tripId,
      bookingId: params.bookingId,
      actorUserId: user.sub,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
