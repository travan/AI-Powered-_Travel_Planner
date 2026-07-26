import { Controller, Get, Inject, Query } from "@nestjs/common";
import { RecommendationsService } from "../../application/recommendations.service.js";
import { PlaceRecommendationQueryDto, TransportRecommendationQueryDto } from "../../dto/recommendation.dto.js";

@Controller("api/recommendations")
export class RecommendationsController {
  constructor(@Inject(RecommendationsService) private readonly recommendations: RecommendationsService) {}

  @Get("places")
  listPlaces(@Query() query: PlaceRecommendationQueryDto) {
    return this.recommendations.listPlaces(query);
  }

  @Get("transport-prices")
  listTransportPrices(
    @Query() query: TransportRecommendationQueryDto
  ) {
    return this.recommendations.listTransportPrices(query);
  }
}
