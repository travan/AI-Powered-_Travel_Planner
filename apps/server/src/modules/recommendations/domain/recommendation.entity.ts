export type PlaceRecommendation = {
  id: string;
  name: string;
  category: string;
  citySlug: string | null;
  address: string | null;
  priceLevel: string | null;
  qualityScore: number;
  lastVerifiedAt: string | null;
};

export type TransportPriceRecommendation = {
  id: string;
  mode: string;
  providerName: string | null;
  originCity: string | null;
  destinationCity: string | null;
  currency: string;
  minPrice: number | null;
  medianPrice: number | null;
  bestObservedAt: string | null;
};
