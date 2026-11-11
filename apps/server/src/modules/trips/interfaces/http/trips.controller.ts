import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type CurrentUserValue,
} from "../../../../shared/nest/current-user.decorator.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { TripsService } from "../../application/trips.service.js";
import {
  CreateTripInviteDto,
  JoinTripInviteDto,
  JoinTripShareLinkDto,
  TripAuditLogQueryDto,
  TripIdParamsDto,
  TripMemberParamsDto,
  UpdateTripMemberDto,
  UpdateTripShareLinkDto,
} from "../../dto/trip.dto.js";

@Controller("api/trips")
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(@Inject(TripsService) private readonly trips: TripsService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserValue) {
    return this.trips.listForUser(user.sub);
  }

  @Get(":id")
  async detail(
    @Param() params: TripIdParamsDto,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.trips.getForUser({
      tripId: params.id,
      userId: user.sub,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get(":id/workspace")
  @Header("Cache-Control", "private, no-store")
  async workspace(@Param() params: TripIdParamsDto, @CurrentUser() user: CurrentUserValue) {
    const result = await this.trips.workspace({ tripId: params.id, actorUserId: user.sub });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get(":id/members")
  async members(
    @Param() params: TripIdParamsDto,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.trips.listMembers({
      tripId: params.id,
      actorUserId: user.sub,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get(":id/membership")
  async membership(
    @Param() params: TripIdParamsDto,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.trips.getMembership({
      tripId: params.id,
      actorUserId: user.sub,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post(":id/invites")
  async createInvite(
    @Param() params: TripIdParamsDto,
    @Body() dto: CreateTripInviteDto,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.trips.createInvite({
      tripId: params.id,
      actorUserId: user.sub,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post("join/invite")
  async joinInvite(
    @Body() dto: JoinTripInviteDto,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.trips.joinInvite({
      actorUserId: user.sub,
      actorEmail: user.email,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Patch(":id/share-link")
  async setShareLink(
    @Param() params: TripIdParamsDto,
    @Body() dto: UpdateTripShareLinkDto,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.trips.setShareLink({
      tripId: params.id,
      actorUserId: user.sub,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post("join/share-link")
  async joinShareLink(
    @Body() dto: JoinTripShareLinkDto,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.trips.joinShareLink({
      actorUserId: user.sub,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Patch(":id/members/:userId")
  async updateMember(
    @Param() params: TripMemberParamsDto,
    @Body() dto: UpdateTripMemberDto,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.trips.updateMember({
      tripId: params.id,
      targetUserId: params.userId,
      actorUserId: user.sub,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get(":id/audit-logs")
  async auditLogs(
    @Param() params: TripIdParamsDto,
    @Query() query: TripAuditLogQueryDto,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.trips.listAuditLogs({
      tripId: params.id,
      actorUserId: user.sub,
      limit: query.limit,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
