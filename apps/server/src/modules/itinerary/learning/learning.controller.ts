import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../../../shared/nest/jwt-auth.guard.js";
import {
  CurrentUser,
  type CurrentUserValue,
} from "../../../shared/nest/current-user.decorator.js";
import { PlannerLearningService } from "./learning.service.js";
import {
  LearningSettingsDto,
  PlannerFeedbackDto,
  LearningTripParamsDto,
  LearningItineraryParamsDto,
} from "./learning.dto.js";
@Controller("api")
@UseGuards(JwtAuthGuard)
export class PlannerLearningController {
  constructor(
    @Inject(PlannerLearningService)
    private readonly learning: PlannerLearningService,
  ) {}
  @Get("learning/settings")
  @Header("Cache-Control", "private, no-store")
  settings(@CurrentUser() u: CurrentUserValue) {
    return this.learning.settings(u.sub);
  }
  @Patch("learning/settings") update(
    @CurrentUser() u: CurrentUserValue,
    @Body() dto: LearningSettingsDto,
  ) {
    return this.learning.updateSettings(u.sub, dto);
  }
  @Post("itinerary/:id/feedback") feedback(
    @CurrentUser() u: CurrentUserValue,
    @Param() p: LearningItineraryParamsDto,
    @Body() dto: PlannerFeedbackDto,
  ) {
    return this.learning.feedback(u.sub, p.id, dto);
  }
  @Post("trips/:tripId/learning-feedback") tripFeedback(
    @CurrentUser() u: CurrentUserValue,
    @Param() p: LearningTripParamsDto,
    @Body() dto: PlannerFeedbackDto,
  ) {
    return this.learning.feedbackForTrip(u.sub, p.tripId, dto);
  }
  @Get("learning/dataset") async dataset(
    @CurrentUser() u: CurrentUserValue,
    @Res() response: Response,
  ) {
    const data = await this.learning.dataset(u.sub);
    response.setHeader("Cache-Control", "private, no-store");
    response
      .type("application/x-ndjson")
      .attachment("travel-training-data.jsonl")
      .send(
        data.map((r) => JSON.stringify(r)).join("\n") +
          (data.length ? "\n" : ""),
      );
  }
}
