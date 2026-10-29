import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type CurrentUserValue,
} from "../../../shared/nest/current-user.decorator.js";
import { JwtAuthGuard } from "../../../shared/nest/jwt-auth.guard.js";
import * as travelTypes from "@travel/types";
const { validatePlanning } =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;
import { GenerateItineraryDto } from "../dto/itinerary.dto.js";
import { JourneyService } from "./journey.service.js";
import {
  TranslationDto,
  TranslationParamsDto,
  TripTranslationParamsDto,
  ChecklistStatusDto,
  AccommodationDto,
  AccommodationParamsDto,
  ApplyRevisionDto,
  JobParamsDto,
  LockPlanDto,
  ResolveLocationDto,
  RevisionDto,
  RevisionParamsDto,
  TripJourneyParamsDto,
} from "./journey.dto.js";

@Controller("api")
export class JourneyController {
  constructor(
    @Inject(JourneyService) private readonly journey: JourneyService,
  ) {}

  @Post("itinerary/:id/translations")
  @UseGuards(JwtAuthGuard)
  translateItinerary(
    @Param() p: TranslationParamsDto,
    @CurrentUser() u: CurrentUserValue,
    @Body() dto: TranslationDto,
  ) {
    return this.journey.enqueueTranslation(u.sub, "itinerary", p.id, dto);
  }
  @Get(["itinerary/:id/translations", "itinerary/:id/translations/:locale"])
  @UseGuards(JwtAuthGuard)
  itineraryTranslations(
    @Param() p: TranslationParamsDto,
    @CurrentUser() u: CurrentUserValue,
  ) {
    return this.journey.listTranslations(u.sub, "itinerary", p.id, p.locale);
  }
  @Post("trips/:tripId/planning/translations")
  @UseGuards(JwtAuthGuard)
  translateTrip(
    @Param() p: TripTranslationParamsDto,
    @CurrentUser() u: CurrentUserValue,
    @Body() dto: TranslationDto,
  ) {
    return this.journey.enqueueTranslation(u.sub, "trip", p.tripId, dto);
  }
  @Get([
    "trips/:tripId/planning/translations",
    "trips/:tripId/planning/translations/:locale",
  ])
  @UseGuards(JwtAuthGuard)
  tripTranslations(
    @Param() p: TripTranslationParamsDto,
    @CurrentUser() u: CurrentUserValue,
  ) {
    return this.journey.listTranslations(u.sub, "trip", p.tripId, p.locale);
  }
  @Get("planning/config") config() {
    return {
      enabled: process.env.JOURNEY_MVP_ENABLED !== "false",
      schema_version: 2,
      timezone: "Asia/Ho_Chi_Minh",
      currency: "VND",
    };
  }
  @Post("locations/resolve") resolve(@Body() dto: ResolveLocationDto) {
    return this.journey.resolveLocation(dto);
  }
  @Post("planning/validate") validate(@Body() dto: GenerateItineraryDto) {
    return validatePlanning(dto as Parameters<typeof validatePlanning>[0]);
  }
  @Get("planning/requests")
  @UseGuards(JwtAuthGuard)
  requests(@CurrentUser() u: CurrentUserValue) {
    return this.journey.listJobs(u.sub);
  }
  @Get("itinerary/jobs/:jobId")
  @UseGuards(JwtAuthGuard)
  job(@Param() p: JobParamsDto, @CurrentUser() u: CurrentUserValue) {
    return this.journey.getJob(u.sub, p.jobId);
  }
  @Get("trips/:tripId/accommodations")
  @UseGuards(JwtAuthGuard)
  stays(@Param() p: TripJourneyParamsDto, @CurrentUser() u: CurrentUserValue) {
    return this.journey.listStays(p.tripId, u.sub);
  }
  @Post("trips/:tripId/accommodations")
  @UseGuards(JwtAuthGuard)
  createStay(
    @Param() p: TripJourneyParamsDto,
    @CurrentUser() u: CurrentUserValue,
    @Body() dto: AccommodationDto,
  ) {
    return this.journey.saveStay(p.tripId, u.sub, dto);
  }
  @Patch("trips/:tripId/accommodations/:id")
  @UseGuards(JwtAuthGuard)
  updateStay(
    @Param() p: AccommodationParamsDto,
    @CurrentUser() u: CurrentUserValue,
    @Body() dto: AccommodationDto,
  ) {
    return this.journey.saveStay(p.tripId, u.sub, dto, p.id);
  }
  @Get("trips/:tripId/planning-checklist")
  @UseGuards(JwtAuthGuard)
  checklist(
    @Param() p: TripJourneyParamsDto,
    @CurrentUser() u: CurrentUserValue,
  ) {
    return this.journey.checklist(p.tripId, u.sub);
  }
  @Patch("trips/:tripId/planning-checklist/:id")
  @UseGuards(JwtAuthGuard)
  check(
    @Param() p: AccommodationParamsDto,
    @CurrentUser() u: CurrentUserValue,
    @Body() dto: ChecklistStatusDto,
  ) {
    return this.journey.updateChecklist(p.tripId, u.sub, p.id, dto.status);
  }
  @Get("trips/:tripId/planning")
  @UseGuards(JwtAuthGuard)
  plan(@Param() p: TripJourneyParamsDto, @CurrentUser() u: CurrentUserValue) {
    return this.journey.getPlan(p.tripId, u.sub);
  }
  @Patch("trips/:tripId/planning")
  @UseGuards(JwtAuthGuard)
  lock(
    @Param() p: TripJourneyParamsDto,
    @CurrentUser() u: CurrentUserValue,
    @Body() dto: LockPlanDto,
  ) {
    return this.journey.lockPlan(
      p.tripId,
      u.sub,
      dto.expected_version,
      dto.locked_ids,
    );
  }
  @Post("trips/:tripId/itinerary-revisions")
  @UseGuards(JwtAuthGuard)
  revision(
    @Param() p: TripJourneyParamsDto,
    @CurrentUser() u: CurrentUserValue,
    @Body() dto: RevisionDto,
  ) {
    return this.journey.enqueueRevision(p.tripId, u.sub, dto);
  }
  @Get("trips/:tripId/itinerary-revisions")
  @UseGuards(JwtAuthGuard)
  revisions(
    @Param() p: TripJourneyParamsDto,
    @CurrentUser() u: CurrentUserValue,
  ) {
    return this.journey.revisions(p.tripId, u.sub);
  }
  @Post("trips/:tripId/itinerary-revisions/:revisionId/apply")
  @UseGuards(JwtAuthGuard)
  apply(
    @Param() p: RevisionParamsDto,
    @CurrentUser() u: CurrentUserValue,
    @Body() dto: ApplyRevisionDto,
  ) {
    return this.journey.applyRevision(
      p.tripId,
      u.sub,
      p.revisionId,
      dto.expected_version,
    );
  }
}
