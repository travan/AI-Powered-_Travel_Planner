import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { ReviewService } from "../../application/review.service.js";
import { ReviewSubmissionDto, ReviewTripParamsDto } from "../../dto/review.dto.js";

@Controller("api/trips/:tripId")
@UseGuards(JwtAuthGuard)
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get("review-queue")
  async listQueue(@Param() params: ReviewTripParamsDto, @CurrentUser() user: CurrentUserValue) {
    const result = await this.review.listQueue({ tripId: params.tripId, actorUserId: user.sub });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Patch("review-submissions")
  async reviewSubmission(
    @Param() params: ReviewTripParamsDto,
    @Body() dto: ReviewSubmissionDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.review.reviewSubmission({ tripId: params.tripId, actorUserId: user.sub, dto });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get("data-quality-signals")
  async listDataQualitySignals(@Param() params: ReviewTripParamsDto, @CurrentUser() user: CurrentUserValue) {
    const result = await this.review.listDataQualitySignals({ tripId: params.tripId, actorUserId: user.sub });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
