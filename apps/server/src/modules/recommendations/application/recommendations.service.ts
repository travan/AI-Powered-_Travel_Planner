import { Inject, Injectable } from "@nestjs/common";
import type { PlaceRecommendation, TransportPriceRecommendation } from "../domain/recommendation.entity.js";
import {
  RECOMMENDATION_REPOSITORY,
  type RecommendationRepository,
} from "../domain/recommendation.repository.js";
import type { PlaceRecommendationQueryDto, TransportRecommendationQueryDto } from "../dto/recommendation.dto.js";

@Injectable()
export class RecommendationsService {
  constructor(
    @Inject(RECOMMENDATION_REPOSITORY)
    private readonly recommendations: RecommendationRepository
  ) {}

  listPlaces(query: PlaceRecommendationQueryDto): Promise<PlaceRecommendation[]> {
    return this.recommendations.listPlaces(query);
  }

  listTransportPrices(query: TransportRecommendationQueryDto): Promise<TransportPriceRecommendation[]> {
    return this.recommendations.listTransportPrices(query);
  }
}
