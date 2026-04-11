import crypto from "node:crypto";
import type { ItineraryInput } from "@travel/types";

/**
 * Create a stable cache key from itinerary input parameters.
 * Normalizes the input so that equivalent requests hit the same cache entry.
 */
export function buildCacheKey(input: ItineraryInput): string {
  const normalized = {
    cities: [...input.cities].map((c) => c.toLowerCase().trim()).sort(),
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    num_days: input.num_days ?? null,
    budget: input.budget ? Math.round(input.budget / 500_000) * 500_000 : null, // round to nearest 500k
    currency: input.currency.toUpperCase(),
    trip_style: input.trip_style,
    num_travelers: input.num_travelers,
  };
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}
