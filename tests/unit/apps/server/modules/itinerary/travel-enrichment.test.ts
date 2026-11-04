import { describe, expect, it } from "vitest";
import {
  enrichTravel,
  itineraryQuality,
  reconcileBudget,
} from "../../../../../../apps/server/src/modules/itinerary/enrichment/travel-enrichment";
import {
  createPlanningCriteria,
  localizedPlan,
  mapUrl,
  type Itinerary,
  type ItineraryInput,
} from "../../../../../../packages/types/src";
import type { CityPlanningData } from "../../../../../../apps/server/src/modules/cities/domain/city.entity";
function plan(): Itinerary {
  return {
    title: "Trip",
    overview: "",
    locale: "en",
    num_days: 2,
    num_travelers: 2,
    currency: "VND",
    total_cost: 1,
    days: [
      {
        day_number: 1,
        date: "2026-12-01",
        city: "Da Nang",
        title: "",
        activities: [],
        daily_cost_estimate: 0,
      },
      {
        day_number: 2,
        date: "2026-12-02",
        city: "Da Nang",
        title: "",
        activities: [],
        daily_cost_estimate: 0,
      },
    ],
    hotels: [],
    restaurants: [],
    suggestions: [],
    transport_summary: [],
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
      accommodation: 0,
      food: 0,
      activities: 0,
      transport: 0,
      contingency: 10,
      total: 10,
      currency: "VND",
      per_day: 5,
      per_person: 5,
    },
  };
}
const cities: CityPlanningData[] = [
  {
    slug: "da-nang",
    name: { en: "Da Nang", vi: "Đà Nẵng" },
    country: "VN",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
    lat: 16,
    lon: 108,
    popular: true,
    places: [
      {
        id: "verified",
        name: "Museum",
        type: "attraction",
        category: null,
        address: "1 Main St",
        lat: 16.1,
        lon: 108.1,
        last_verified_at: "2026-11-01",
        tags: [],
        price_level: null,
        rating: null,
        opening_hours: {},
        source: "google",
      },
    ],
    activities: [],
  },
];
describe("travel enrichment", () => {
  it("matches places within their city and ignores invented coordinates and URLs", () => {
    const p = plan();
    p.days[0]!.activities = [
      {
        name: "Museum",
        time: "09:00",
        duration: "1h",
        description: "",
        category: "attraction",
        cost: null,
        currency: "VND",
        maps_link: "https://evil.invalid",
        lat: 99,
        lon: 99,
      },
    ];
    p.days[1]!.city = "Hanoi";
    p.days[1]!.activities = structuredClone(p.days[0]!.activities);
    const enriched = enrichTravel(p, cities);
    expect(enriched.days[0]!.activities[0]).toMatchObject({
      map_precision: "verified",
      lat: 16.1,
      city_slug: "da-nang",
    });
    expect(enriched.days[0]!.activities[0]!.maps_link).toContain(
      "16.1%2C108.1",
    );
    expect(enriched.days[1]!.activities[0]!.map_precision).toBe("search");
    expect(enriched.days[1]!.activities[0]!.maps_link).not.toContain("99");
    expect(p.days[0]!.activities[0]!.maps_link).toContain("evil");
  });
  it("stores canonical English city labels even when the generated content is Vietnamese", () => {
    const p = plan();
    p.locale = "vi";
    p.days[0]!.city = "Đà Nẵng";
    const saved = enrichTravel(p, cities, { locale: "vi" } as ItineraryInput);
    expect(saved.days[0]!.city).toBe("Da Nang");
    expect(saved.days[0]!.city_slug).toBe("da-nang");
    expect(localizedPlan(saved, "vi").days[0]!.city).toBe("Đà Nẵng");
  });
  it("changes display names without changing city identity", () => {
    const p = enrichTravel(plan(), cities);
    expect(localizedPlan(p, "vi").days[0]).toMatchObject({
      city: "Đà Nẵng",
      city_slug: "da-nang",
    });
    expect(localizedPlan(p, "en").days[0]!.city).toBe("Da Nang");
  });
  it("keeps unknown costs explicit and charges a confirmed roundtrip once", () => {
    const p = plan(),
      planning = createPlanningCriteria();
    planning.transport_preferences = {
      ...planning.transport_preferences,
      mode: "flight",
      confirmed: true,
      total_price: 900,
    };
    p.transport_summary = [
      {
        from: "Home",
        to: "Da Nang",
        segment: "out",
        recommended_mode: "flight",
        options: [],
      },
      {
        from: "Da Nang",
        to: "Home",
        segment: "back",
        recommended_mode: "flight",
        options: [],
      },
    ];
    const input = { planning, locale: "en", budget: 100 } as ItineraryInput;
    reconcileBudget(p, input);
    expect(p.budget_breakdown.transport).toBe(900);
    expect(p.budget_breakdown.transport_details?.flight).toBe(900);
    expect(p.budget_breakdown.complete).toBe(false);
    expect(p.total_cost).toBe(910);
    expect(p.issues?.some((i) => i.code === "OVER_BUDGET")).toBe(true);
  });
  it("multiplies per-person activity costs once and excludes duplicate timeline transport", () => {
    const p = plan();
    p.days[0]!.activities = [
      {
        name: "Meal",
        time: "12:00",
        duration: "1h",
        description: "",
        kind: "meal",
        category: "food",
        cost: 50,
        currency: "VND",
        maps_link: "",
        price: {
          amount: 50,
          currency: "VND",
          scope: "person",
          status: "estimated",
        },
      },
    ];
    reconcileBudget(p);
    expect(p.budget_breakdown.food).toBe(100);
    expect(p.budget_breakdown.missing_items).toContain("Da Nang");
  });
  it("requires three meals on full days but respects arrival/departure windows", () => {
    const p = plan();
    const input = {
      planning: createPlanningCriteria(),
      locale: "en",
    } as ItineraryInput;
    expect(
      itineraryQuality(p, input).filter((i) => i.code === "MEAL_MISSING"),
    ).toHaveLength(6);
    input.planning!.transport_preferences.arrival_at = "2026-12-01T16:00";
    expect(
      itineraryQuality(p, input).filter(
        (i) => i.code === "MEAL_MISSING" && i.message.startsWith("Day 1"),
      ),
    ).toHaveLength(1);
  });
  it("does not use unverified coordinates for Maps", () => {
    expect(
      mapUrl({ name: "Museum", city: "Hanoi", lat: 99, lon: 99 }),
    ).toContain("Hanoi");
  });
});
