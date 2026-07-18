import { Controller, Get, Param, Req } from "@nestjs/common";
import type { Request } from "express";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { getBearerToken } from "../../../../shared/nest/jwt-auth.guard.js";
import { LocalJwtService } from "../../../../shared/nest/local-jwt.js";
import { ItineraryService } from "../../application/itinerary.service.js";
import { ItineraryIdParamsDto } from "../../dto/itinerary.dto.js";

@Controller("api/itinerary")
export class ItineraryController {
  constructor(
    private readonly itineraries: ItineraryService,
    private readonly jwt: LocalJwtService
  ) {}

  @Get(":id")
  async getById(
    @Param() params: ItineraryIdParamsDto,
    @Req() request: Request
  ) {
    const result = await this.itineraries.getVisible({
      itineraryId: params.id,
      userId: this.resolveOptionalUserId(request),
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  private resolveOptionalUserId(request: Request): string | null {
    const token = getBearerToken(request.headers.authorization);
    if (!token) return null;
    if (token.startsWith("mock-access-")) return token.slice("mock-access-".length) || null;
    if (token.startsWith("mock-mobile-access-")) return token.slice("mock-mobile-access-".length) || null;
    return this.jwt.verify(token)?.sub ?? null;
  }
}
