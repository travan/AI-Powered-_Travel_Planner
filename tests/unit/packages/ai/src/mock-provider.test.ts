import { describe, expect, it } from "vitest";
import type { ItineraryInput } from "../../../../../packages/types/src/itinerary.js";
import { MockAIProvider } from "../../../../../packages/ai/src/providers/mock.js";

const input: ItineraryInput = {
  cities: ["da-lat"],
  start_date: "2026-09-22",
  num_days: 7,
  budget: 3500,
  currency: "USD",
  trip_style: "adventure",
  locale: "en",
  num_travelers: 2,
};

describe("MockAIProvider", () => {
  it("keeps fallback itinerary activities distinct across days", async () => {
    const provider = new MockAIProvider();
    const overview = await provider.generateOverview(input, [
      {
        city: "Da Lat",
        country: "Vietnam",
        timezone: "Asia/Ho_Chi_Minh",
        currency: "USD",
        lat: 11.94,
        lon: 108.46,
        places: [],
        restaurants: [],
        hotels: [],
        sunrise: "06:00",
        sunset: "18:00",
        daylight_hours: "~12 hours",
        weather_note: "Typical conditions",
        weather_highlights: [],
        weather_warnings: [],
        transport_options: [],
        ticket_options: {},
      },
    ]);
    const itinerary = await provider.generateDetail(input, overview, [
      {
        city: "Da Lat",
        country: "Vietnam",
        timezone: "Asia/Ho_Chi_Minh",
        currency: "USD",
        lat: 11.94,
        lon: 108.46,
        places: [],
        restaurants: [],
        hotels: [],
        sunrise: "06:00",
        sunset: "18:00",
        daylight_hours: "~12 hours",
        weather_note: "Typical conditions",
        weather_highlights: [],
        weather_warnings: [],
        transport_options: [],
        ticket_options: {},
      },
    ]);

    const names = itinerary.days.flatMap((day) => day.activities.map((activity) => activity.name));

    expect(itinerary.days).toHaveLength(7);
    expect(new Set(names).size).toBe(names.length);
    expect(itinerary.days.map((day) => day.daily_cost_estimate)).toEqual([
      460,
      500,
      540,
      460,
      500,
      540,
      460,
    ]);
  });
});
