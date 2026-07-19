import type {
  PlaceRecommendationSummary,
  TransportPriceRecommendationSummary,
} from "@travel/types";
import {
  listPlaceRecommendations,
  listTransportPriceRecommendations,
} from "../../../db/recommendation-store.js";
import type {
  PlaceRecommendationQueryDto,
  TransportRecommendationQueryDto,
} from "../dto/recommendation.dto.js";

export class RecommendationService {
  places(input: PlaceRecommendationQueryDto): Promise<PlaceRecommendationSummary[]> {
    return listPlaceRecommendations(input);
  }

  transportPrices(input: TransportRecommendationQueryDto): Promise<TransportPriceRecommendationSummary[]> {
    return listTransportPriceRecommendations(input);
  }
}

export const recommendationService = new RecommendationService();
