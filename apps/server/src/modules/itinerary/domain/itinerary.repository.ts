import type { ItineraryDetail } from "./itinerary.entity.js";

export const ITINERARY_REPOSITORY = Symbol("ITINERARY_REPOSITORY");

export type ItineraryRepository = {
  findVisible(input: { itineraryId: string; userId?: string | null }): Promise<ItineraryDetail | null>;
};
