import { JourneyService } from "../../journey/journey.service.js";
import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  HttpException,
  Inject,
  Param,
  Post,
  Patch,
  Delete,
  ParseUUIDPipe,
  BadRequestException,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { normalizeOllamaItinerary } from "@travel/ai";
import {
  CurrentUser,
  type CurrentUserValue,
} from "../../../../shared/nest/current-user.decorator.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import {
  getBearerToken,
  JwtAuthGuard,
} from "../../../../shared/nest/jwt-auth.guard.js";
import { LocalJwtService } from "../../../../shared/nest/local-jwt.js";
import { ItineraryService } from "../../application/itinerary.service.js";
import {
  GenerateItineraryDto,
  ItineraryIdParamsDto,
} from "../../dto/itinerary.dto.js";

@Controller("api/itinerary")
export class ItineraryController {
  constructor(
    @Inject(ItineraryService) private readonly itineraries: ItineraryService,
    @Inject(JourneyService) private readonly journey: JourneyService,
    @Inject(LocalJwtService) private readonly jwt: LocalJwtService,
  ) {}

  @Patch(":id/share")
  @UseGuards(JwtAuthGuard)
  async share(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.itineraries.createShareLink(id, user.sub);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Delete(":id/share")
  @UseGuards(JwtAuthGuard)
  async revokeShare(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.itineraries.revokeShareLink(id, user.sub);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get("shared/:token")
  @Header("Cache-Control", "private, no-store")
  async shared(@Param("token") token: string) {
    if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token))
      throw new BadRequestException("Invalid share link");
    const result = await this.itineraries.sharedItinerary(token);
    if (!result.ok) throwServiceError(result.error);
    return { itineraries: [result.value] };
  }

  @Post("generate")
  @UseGuards(JwtAuthGuard)
  async generate(
    @Body() dto: GenerateItineraryDto,
    @CurrentUser() user: CurrentUserValue,
    @Headers("idempotency-key") key: string | undefined,
    @Headers("x-planning-pipeline") pipeline: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.journey.enqueue(user.sub, dto, key, pipeline);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429)
        response.setHeader("Retry-After", "30");
      throw error;
    }
  }

  @Get("trips/:tripId")
  @UseGuards(JwtAuthGuard)
  async getSavedForTrip(
    @Param("tripId") tripId: string,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.itineraries.getForTrip({
      tripId,
      userId: user.sub,
    });
    if (!result.ok) throwServiceError(result.error);
    const detail = result.value;
    if (
      detail.result &&
      (detail.result as { schema_version?: number }).schema_version === 2
    ) {
      return {
        itinerary: {
          id: detail.id,
          ...(await this.journey.getPlan(tripId, user.sub)),
        },
      };
    }
    return {
      itinerary: detail.result
        ? {
            id: detail.id,
            ...(await this.itineraries.presentStored(detail.result)),
          }
        : null,
    };
  }

  @Post(":id/save")
  @UseGuards(JwtAuthGuard)
  async save(
    @Param() params: ItineraryIdParamsDto,
    @CurrentUser() user: CurrentUserValue,
  ) {
    const result = await this.itineraries.save({
      itineraryId: params.id,
      userId: user.sub,
    });
    if (!result.ok) throwServiceError(result.error);
    await this.journey.seedInitialBookings(result.value.trip_id, user.sub);
    await this.journey.seedChecklist(result.value.trip_id, user.sub);
    return result.value;
  }

  @Get(":id")
  async getById(
    @Param() params: ItineraryIdParamsDto,
    @Req() request: Request,
  ) {
    const userId = this.resolveOptionalUserId(request);
    const result = await this.itineraries.getVisible({
      itineraryId: params.id,
      userId,
    });
    if (!result.ok) throwServiceError(result.error);
    const detail = result.value;
    return {
      can_share: Boolean(userId && detail.userId === userId),
      itineraries: detail.result
        ? [
            {
              id: detail.id,
              ...(await this.itineraries.presentStored(detail.result)),
            },
          ]
        : [],
    };
  }

  private resolveOptionalUserId(request: Request): string | null {
    const token = getBearerToken(request.headers.authorization);
    if (!token) return null;
    const mockAllowed =
      process.env.NODE_ENV !== "production" &&
      process.env.TEST_ENABLE_MOCK_TOKENS === "true";
    if (mockAllowed && token.startsWith("mock-access-"))
      return token.slice("mock-access-".length) || null;
    if (mockAllowed && token.startsWith("mock-mobile-access-"))
      return token.slice("mock-mobile-access-".length) || null;
    return this.jwt.verify(token)?.sub ?? null;
  }
}
