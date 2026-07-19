import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { ActivitiesService } from "../../application/activities.service.js";
import {
  ActivityCatalogQueryDto,
  CreateTripActivityDto,
  TripActivityIdParamsDto,
  TripActivityParamsDto,
  TripActivityParticipantParamsDto,
  UpdateActivityParticipantDto,
  UpdateTripActivityDto,
} from "../../dto/activity.dto.js";

@Controller("api")
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get("activities/catalog")
  searchCatalog(@Query() query: ActivityCatalogQueryDto) {
    return this.activities.searchCatalog(query);
  }

  @Get("trips/:tripId/activities")
  @UseGuards(JwtAuthGuard)
  async listTripActivities(@Param() params: TripActivityParamsDto, @CurrentUser() user: CurrentUserValue) {
    const result = await this.activities.listTripActivities({ tripId: params.tripId, actorUserId: user.sub });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post("trips/:tripId/activities")
  @UseGuards(JwtAuthGuard)
  async createTripActivity(
    @Param() params: TripActivityParamsDto,
    @Body() dto: CreateTripActivityDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.activities.createTripActivity({ tripId: params.tripId, actorUserId: user.sub, dto });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Patch("trips/:tripId/activities/:activityId")
  @UseGuards(JwtAuthGuard)
  async updateTripActivity(
    @Param() params: TripActivityIdParamsDto,
    @Body() dto: UpdateTripActivityDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.activities.updateTripActivity({
      tripId: params.tripId,
      activityId: params.activityId,
      actorUserId: user.sub,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Patch("trips/:tripId/activities/:activityId/participants/:userId")
  @UseGuards(JwtAuthGuard)
  async updateParticipant(
    @Param() params: TripActivityParticipantParamsDto,
    @Body() dto: UpdateActivityParticipantDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.activities.updateParticipant({
      tripId: params.tripId,
      activityId: params.activityId,
      targetUserId: params.userId,
      actorUserId: user.sub,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
