import type {
  PlaceRecommendation,
  TransportPriceRecommendation,
} from "./recommendation.entity.js";

export const RECOMMENDATION_REPOSITORY = Symbol("RECOMMENDATION_REPOSITORY");

export type PlaceRecommendationQuery = {
  q?: string;
  tags?: string;
  maxPrice?: number;
  independentOnly?: string;
  currency?: string;
  citySlug?: string;
  category?: string;
  limit: number;
};

export type TransportPriceRecommendationQuery = {
  mode?: string;
  originCity?: string;
  destinationCity?: string;
  limit: number;
};

export type RecommendationRepository = {
  listPlaces(query: PlaceRecommendationQuery): Promise<PlaceRecommendation[]>;
  listTransportPrices(
    query: TransportPriceRecommendationQuery,
  ): Promise<TransportPriceRecommendation[]>;
};
