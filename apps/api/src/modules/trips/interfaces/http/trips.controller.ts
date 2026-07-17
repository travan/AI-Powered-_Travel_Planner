import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { tripService } from "../../application/trip.service.js";
import {
  activityStatusDto,
  activityStatusParamsDto,
  changeRequestReviewParamsDto,
  checklistStatusDto,
  checklistStatusParamsDto,
  createPlaceSubmissionDto,
  createTripActivityDto,
  createTripExpenseDto,
  reviewTripChangeRequestDto,
  tripIdParamsDto,
  type ActivityStatusDto,
  type ChecklistStatusDto,
  type CreatePlaceSubmissionDto,
  type CreateTripActivityDto,
  type CreateTripExpenseDto,
  type ReviewTripChangeRequestDto,
} from "../../dto/trip.dto.js";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { throwHttpError } from "../../../../shared/nest/http-errors.js";
import { ZodValidationPipe } from "../../../../shared/nest/zod-validation.pipe.js";

@Controller("api")
@UseGuards(JwtAuthGuard)
export class TripsController {
  @Get("profile/me")
  async profile(@CurrentUser() user: CurrentUserValue) {
    const result = await tripService.getProfile(user.sub);
    if (!result.ok) throwHttpError(result.error.statusCode, result.error.message);
    return result.value;
  }

  @Get("trips")
  async list(@CurrentUser() user: CurrentUserValue) {
    return tripService.listTrips(user.sub);
  }

  @Get("trips/:id")
  async detail(
    @Param(new ZodValidationPipe(tripIdParamsDto)) params: { id: string },
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await tripService.getTripDetail({ tripId: params.id, userId: user.sub });
    if (!result.ok) throwHttpError(result.error.statusCode, result.error.message);
    return result.value;
  }

  @Patch("trips/:id/activities/:activityId/status")
  async updateActivityStatus(
    @Param(new ZodValidationPipe(activityStatusParamsDto)) params: { id: string; activityId: string },
    @Body(new ZodValidationPipe(activityStatusDto)) dto: ActivityStatusDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await tripService.updateActivityStatus({
      tripId: params.id,
      activityId: params.activityId,
      userId: user.sub,
      dto,
    });
    if (!result.ok) throwHttpError(result.error.statusCode, result.error.message);
    return result.value;
  }

  @Post("trips/:id/activities")
  async addActivity(
    @Param(new ZodValidationPipe(tripIdParamsDto)) params: { id: string },
    @Body(new ZodValidationPipe(createTripActivityDto)) dto: CreateTripActivityDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await tripService.addActivity({ tripId: params.id, userId: user.sub, dto });
    if (!result.ok) throwHttpError(result.error.statusCode, result.error.message);
    return result.value;
  }

  @Post("trips/:id/place-submissions")
  async addPlaceSubmission(
    @Param(new ZodValidationPipe(tripIdParamsDto)) params: { id: string },
    @Body(new ZodValidationPipe(createPlaceSubmissionDto)) dto: CreatePlaceSubmissionDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await tripService.addPlaceSubmission({ tripId: params.id, userId: user.sub, dto });
    if (!result.ok) throwHttpError(result.error.statusCode, result.error.message);
    return result.value;
  }

  @Post("trips/:id/expenses")
  async addExpense(
    @Param(new ZodValidationPipe(tripIdParamsDto)) params: { id: string },
    @Body(new ZodValidationPipe(createTripExpenseDto)) dto: CreateTripExpenseDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await tripService.addExpense({ tripId: params.id, userId: user.sub, dto });
    if (!result.ok) throwHttpError(result.error.statusCode, result.error.message);
    return result.value;
  }

  @Patch("trips/:id/checklist/:itemId/status")
  async updateChecklistStatus(
    @Param(new ZodValidationPipe(checklistStatusParamsDto)) params: { id: string; itemId: string },
    @Body(new ZodValidationPipe(checklistStatusDto)) dto: ChecklistStatusDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await tripService.updateChecklistStatus({
      tripId: params.id,
      itemId: params.itemId,
      userId: user.sub,
      dto,
    });
    if (!result.ok) throwHttpError(result.error.statusCode, result.error.message);
    return result.value;
  }

  @Patch("trips/:id/change-requests/:requestId/review")
  async reviewChangeRequest(
    @Param(new ZodValidationPipe(changeRequestReviewParamsDto)) params: { id: string; requestId: string },
    @Body(new ZodValidationPipe(reviewTripChangeRequestDto)) dto: ReviewTripChangeRequestDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await tripService.reviewChangeRequest({
      tripId: params.id,
      requestId: params.requestId,
      userId: user.sub,
      dto,
    });
    if (!result.ok) throwHttpError(result.error.statusCode, result.error.message);
    return result.value;
  }
}
