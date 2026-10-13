import type { ItineraryDetail } from "./itinerary.entity.js";
import type { Itinerary, ItineraryInput } from "@travel/types";

export const ITINERARY_REPOSITORY = Symbol("ITINERARY_REPOSITORY");

export type ItineraryRepository = {
  findVisible(input: { itineraryId: string; userId?: string | null }): Promise<ItineraryDetail | null>;
  findForTrip(input: { tripId: string; userId: string }): Promise<ItineraryDetail | null>;
  createComplete(input: {
    userId: string;
    request: ItineraryInput;
    result: Itinerary;
    catalogCities: Array<{ slug: string; name: string }>;
  }): Promise<string>;
  saveAsTrip(input: {
    itineraryId: string;
    userId: string;
  }): Promise<{ tripId: string } | null>;
};
