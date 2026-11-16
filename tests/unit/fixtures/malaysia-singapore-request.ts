import type { GenerateRequest } from "@travel/types";

// Request captured from the production planner; return a fresh copy per test.
export function malaysiaSingaporeRequest(): GenerateRequest {
  return {
    cities: ["country-my", "country-sg"],
    city_names: ["Malaysia", "Singapore"],
    destination_refs: [
      { id: "country-my", name: "Malaysia", country: "MY", kind: "country" },
      { id: "country-sg", name: "Singapore", country: "SG", kind: "country" },
    ],
    num_days: 10,
    flexible_month: "2027-01",
    budget: 20000000,
    currency: "VND",
    trip_style: "mixed",
    force_refresh: false,
    locale: "vi",
    num_travelers: 2,
    planning: {
      schema_version: 2,
      journey: {
        origin: { label: "Hà Nội", source: "manual", city_slug: "ha-noi" },
        return_to_origin: true,
        destinations: ["country-my", "country-sg"],
        timezone: "Asia/Ho_Chi_Minh",
      },
      travelers: { adults: 2, child_ages: [] },
      budget: { currency: "VND", total: 20000000 },
      transport_preferences: {
        mode: "suggest",
        airport_buffer_minutes: 120,
        confirmed: false,
      },
      stay_preferences: { type: "hotel", rooms: 1, requirements: [] },
      dining_preferences: {
        requirements: [],
        allergies: [],
        cafe: "",
        independent_only: true,
      },
      experience_preferences: {
        pace: "balanced",
        interests: [],
        requirements: [],
      },
    },
  };
}
