import type { ItineraryDetail } from "./itinerary.entity.js";
import type { Itinerary, ItineraryInput, AiTokenUsage } from "@travel/types";

export const ITINERARY_REPOSITORY = Symbol("ITINERARY_REPOSITORY");

export type ItineraryRepository = {
  findVisible(input: { itineraryId: string; userId?: string | null }): Promise<ItineraryDetail | null>;
  findForTrip(input: { tripId: string; userId: string }): Promise<ItineraryDetail | null>;
  findReusable(input: { userId: string; cacheKey: string }): Promise<{ id: string; result: Itinerary } | null>;
  createComplete(input: {
    userId: string;
    request: ItineraryInput;
    result: Itinerary;
    jobClaim?: { id: string; token: string };
    catalogCities: Array<{ slug: string; name: string }>;
  }): Promise<string>;
  recordFailure(input: {
    userId: string;
    request: ItineraryInput;
    provider: string;
    code: string;
    message: string;
    usage?: AiTokenUsage[];
  }): Promise<void>;
  saveAsTrip(input: {
    itineraryId: string;
    userId: string;
  }): Promise<{ tripId: string } | null>;
};
