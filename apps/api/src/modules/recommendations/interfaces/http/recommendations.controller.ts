import { Controller, Get, Query } from "@nestjs/common";
import { recommendationService } from "../../application/recommendation.service.js";
import {
  placeRecommendationQueryDto,
  transportRecommendationQueryDto,
} from "../../dto/recommendation.dto.js";
import { ZodValidationPipe } from "../../../../shared/nest/zod-validation.pipe.js";

@Controller("api/recommendations")
export class RecommendationsController {
  @Get("places")
  async places(@Query(new ZodValidationPipe(placeRecommendationQueryDto)) query: unknown) {
    return recommendationService.places(query as Parameters<typeof recommendationService.places>[0]);
  }

  @Get("transport-prices")
  async transportPrices(@Query(new ZodValidationPipe(transportRecommendationQueryDto)) query: unknown) {
    return recommendationService.transportPrices(query as Parameters<typeof recommendationService.transportPrices>[0]);
  }
}
