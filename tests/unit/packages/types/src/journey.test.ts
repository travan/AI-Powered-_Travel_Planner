import { describe, expect, it, vi } from "vitest";
import {
  createPlanningCriteria,
  localTripInstant,
  tripDayCount,
  upgradeJourneyPlan,
  validatePlanning,
} from "../../../../../packages/types/src/journey";
import type { Itinerary, ItineraryInput } from "@travel/types";
const request = (): ItineraryInput => {
  const planning = createPlanningCriteria();
  planning.journey.origin = { label: "Hà Nội", source: "manual" };
  planning.journey.destinations = ["da-nang"];
  return {
    cities: ["da-nang"],
    start_date: "2026-11-01",
    end_date: "2026-11-03",
    currency: "VND",
    trip_style: "mixed",
    locale: "vi",
    num_travelers: 2,
    planning,
  };
};
const plan = (): Itinerary => ({
  title: "Trip",
  overview: "",
  currency: "VND",
  num_days: 3,
  num_travelers: 2,
  total_cost: 100,
  days: [
    {
      day_number: 3,
      date: "2026-11-03",
      city: "Đà Nẵng",
      title: "",
      daily_cost_estimate: 100,
      activities: [
        {
          name: "Museum",
          time: "15:00",
          duration: "2h",
          cost: 10,
          currency: "VND",
          category: "attraction",
          description: "",
          maps_link: "",
        },
      ],
    },
  ],
  hotels: [],
  restaurants: [],
  transport_summary: [],
  suggestions: [],
  seasonal_notes: {
    travel_month: "",
    daylight_hours: "",
    sunrise_time: "",
    sunset_time: "",
    weather_note: "",
    highlights: [],
    warnings: [],
  },
  budget_breakdown: {
    accommodation: 30,
    food: 20,
    activities: 20,
    transport: 20,
    contingency: 10,
    total: 100,
    currency: "VND",
    per_person: 50,
    per_day: 33,
  },
});
describe("complete journey rules", () => {
  it("rejects equal/reversed exact dates while duration-based day trips remain valid", () => {
    const input = request();
    input.end_date = input.start_date;
    expect(
      validatePlanning(input).issues.some(
        (issue) => issue.code === "DATE_ORDER",
      ),
    ).toBe(true);
    input.end_date = "2026-10-31";
    expect(
      validatePlanning(input).issues.some(
        (issue) => issue.code === "DATE_ORDER",
      ),
    ).toBe(true);
    delete input.start_date;
    delete input.end_date;
    input.num_days = 1;
    expect(validatePlanning(input).valid).toBe(true);
  });
  it("uses Vietnam local time and inclusive dates independent of host timezone", () => {
    expect(localTripInstant("2026-11-03T15:00")).toBe(
      Date.parse("2026-11-03T08:00:00Z"),
    );
    expect(tripDayCount(request())).toBe(3);
  });
  it("validates flexible dates against the normalized trip length", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-29T02:00:00Z"));
      const input = { ...request(), flexible_month: "2026-11", num_days: 1 };
      expect(validatePlanning(input)).toMatchObject({
        valid: false,
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "MONTH_UNAVAILABLE", field: "flexible_month" }),
        ]),
      });
      input.end_date = "2026-11-02";
      expect(validatePlanning(input).valid).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("requires endpoint for one-way travel and validates return times", () => {
    const input = request();
    input.planning!.journey.return_to_origin = false;
    input.planning!.transport_preferences.arrival_at = "2026-11-03T20:00";
    input.planning!.transport_preferences.departure_at = "2026-11-03T15:00";
    const result = validatePlanning(input);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["ENDPOINT_REQUIRED", "TRAVEL_TIME_ORDER"]),
    );
  });
  it("flags per-room group budget and never treats an allergy as a preference", () => {
    const input = request();
    input.planning!.budget.total = 1000000;
    input.planning!.stay_preferences.rooms = 2;
    input.planning!.stay_preferences.nightly_budget = 500000;
    input.planning!.dining_preferences.allergies = ["peanuts"];
    expect(validatePlanning(input).issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["LODGING_OVER_BUDGET", "ALLERGY_CONFIRMATION"]),
    );
  });
  it("preserves stable ids and legacy notes across reopening", () => {
    const old = plan();
    old.hotels = [
      {
        name: "Old hotel",
        note: "Keep old note",
        price_per_night: "",
        price_range: "",
        booking_url: "",
        airbnb_url: "",
        address: "",
        maps_link: "",
      },
    ];
    const upgraded = upgradeJourneyPlan(old, request());
    expect(upgradeJourneyPlan(upgraded).days[0]!.activities[0]!.id).toBe(
      upgraded.days[0]!.activities[0]!.id,
    );
    expect(upgraded.hotels[0]!.note).toBe("Keep old note");
  });
  it("detects sightseeing after the flight buffer and missing door-to-door legs", () => {
    const input = request();
    input.planning!.transport_preferences = {
      ...input.planning!.transport_preferences,
      mode: "flight",
      departure_at: "2026-11-03T17:00",
    };
    const result = upgradeJourneyPlan(plan(), input);
    expect(result.issues!.map((i) => i.code)).toEqual(
      expect.arrayContaining([
        "TRAVEL_CONFLICT",
        "OUTBOUND_MISSING",
        "RETURN_MISSING",
      ]),
    );
  });
  it("rejects overnight charges for a no-stay day trip", () => {
    const input = request();
    input.planning!.stay_preferences.type = "none";
    expect(
      upgradeJourneyPlan(plan(), input).issues!.map((i) => i.code),
    ).toContain("UNEXPECTED_STAY_COST");
  });
});
