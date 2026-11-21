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
  it("reconciles the Ha Giang group estimate without duplicating main travel", () => {
    const p = plan();
    p.num_days = 7;
    const price = (amount: number, scope: "group" | "person") => ({
      evidence: {
        source: "catalog" as const,
        verified_at: new Date().toISOString(),
      },
      amount,
      scope,
      currency: "VND",
      status: "estimated" as const,
      basis: "planning_estimate" as const,
      assumption: "Unverified planning estimate",
    });
    p.days = Array.from(
      { length: 7 },
      (_, index) =>
        ({
          ...p.days[0]!,
          day_number: index + 1,
          city_slug: "ha-giang",
          activities: [
            {
              name: "Local",
              kind: "transfer",
              category: "transport",
              cost: 200000,
              currency: "VND",
              price: price(200000, "group"),
            },
            ...(index === 0
              ? [
                  {
                    name: "Meals",
                    kind: "meal",
                    category: "food",
                    cost: 2040000,
                    currency: "VND",
                    price: price(2040000, "person"),
                  },
                  {
                    name: "Visits",
                    description: "Estimated sightseeing",
                    kind: "visit",
                    category: "attraction",
                    cost: 210000,
                    currency: "VND",
                    price: price(210000, "person"),
                  },
                ]
              : []),
          ],
        }) as Itinerary["days"][number],
    );
    p.hotels = [
      {
        name: "Stay",
        city: "Ha Giang",
        city_slug: "ha-giang",
        nightly_estimate: 800000,
        price: { ...price(800000, "group"), scope: "room_night" },
        rooms: 1,
        nights: 6,
      } as Itinerary["hotels"][number],
    ];
    p.transport_summary = ["outbound", "return"].map(
      (segment) =>
        ({
          segment,
          from: "A",
          to: "B",
          recommended_mode: "other",
          options: [],
          price: price(1000000, "person"),
        }) as Itinerary["transport_summary"][number],
    );
    const criteria = createPlanningCriteria();
    const input = {
      planning: criteria,
      cities: ["ha-giang"],
      currency: "VND",
      trip_style: "mixed",
      num_travelers: 2,
    } as ItineraryInput;
    const result = reconcileBudget(p, input);
    expect(result.budget_breakdown).toMatchObject({
      accommodation: 4800000,
      food: 4080000,
      activities: 420000,
      transport: 5400000,
      contingency: 1470000,
      total: 16170000,
    });
  });
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
    expect(p.total_cost).toBe(900);
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
          evidence: {
            source: "catalog",
            verified_at: new Date().toISOString(),
          },
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

describe("itinerary review regressions", () => {
  it("does not flag a known time/duration solely because transfer time is unknown", () => {
    const p = plan();
    p.days[0]!.activities = [
      {
        name: "Lunch at Kani Doraku",
        time: "1:00 PM",
        duration: "1 hour",
        description: "Local meal",
        category: "food",
        cost: null,
        currency: "VND",
        maps_link: "",
      },
    ];
    const issues = itineraryQuality(p);
    expect(issues.some((i) => i.code === "SCHEDULE_DETAILS_MISSING")).toBe(
      false,
    );
    expect(
      issues.some(
        (i) =>
          i.code === "MEAL_MISSING" && i.message === "Day 1: missing lunch.",
      ),
    ).toBe(false);
  });
  it("keeps meal diagnostics out of financial missing items", () => {
    const p = reconcileBudget(plan());
    expect(p.budget_breakdown.complete).toBe(false);
    expect(p.budget_breakdown.missing_items).toContain("food");
    expect(
      p.budget_breakdown.missing_items?.some((item) => item.includes("Day 1:")),
    ).toBe(false);
  });
  it("removes model prices, invented addresses and false free access", () => {
    const p = plan();
    p.days[0]!.activities = [
      {
        name: "Unverified museum",
        address: "Invented address",
        time: "09:00",
        duration: "1h",
        description: "",
        category: "attraction",
        cost: 0,
        price: {
          amount: 0,
          currency: "VND",
          scope: "group",
          status: "estimated",
        },
        currency: "VND",
        maps_link: "",
      },
    ];
    const result = enrichTravel(p, cities);
    expect(result.days[0]!.activities[0]).toMatchObject({
      address: "",
      cost: null,
      price: { amount: null },
    });
  });
  it("uses a verified catalog estimate and counts the group once", () => {
    const catalog = structuredClone(cities);
    catalog[0]!.activities = [
      {
        title: "Museum",
        source: "official",
        last_verified_at: "2026-11-01",
        estimated_cost: 20,
        currency: "VND",
        duration_minutes: 60,
        tags: [],
        category: "attraction",
      },
    ];
    const p = plan();
    p.days[0]!.activities = [
      {
        name: "Museum",
        time: "09:00",
        duration: "1h",
        description: "",
        category: "attraction",
        cost: 500,
        currency: "VND",
        maps_link: "",
      },
    ];
    const result = reconcileBudget(enrichTravel(p, catalog));
    expect(result.budget_breakdown.activities).toBe(40);
    expect(result.days[0]!.daily_cost_estimate).toBe(40);
  });
});

describe("full-day coverage", () => {
  it("requests an evening experience and hotel return when the plan ends at dinner", () => {
    const p = plan();
    p.days[0]!.activities = [
      {
        name: "Dinner",
        kind: "meal",
        meal_slot: "dinner",
        time: "18:00",
        duration: "1h",
        description: "",
        category: "food",
        cost: null,
        currency: "VND",
        maps_link: "",
      },
    ];
    expect(itineraryQuality(p).map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["EVENING_MISSING", "HOTEL_RETURN_MISSING"]),
    );
    const input = { planning: createPlanningCriteria() } as ItineraryInput;
    input.planning!.transport_preferences.departure_at = "2026-12-01T20:00";
    expect(
      itineraryQuality(p, input).some(
        (issue) => issue.code === "EVENING_MISSING",
      ),
    ).toBe(false);
  });
  it("allows a real full-day experience instead of padding the visit count", () => {
    const p = plan();
    p.days[0]!.activities = [
      {
        name: "Theme park",
        kind: "visit",
        time: "09:00",
        duration: "6h",
        description: "A full-day experience with breaks.",
        category: "attraction",
        cost: null,
        currency: "VND",
        maps_link: "",
      },
    ];
    expect(
      itineraryQuality(p).some(
        (issue) =>
          issue.code === "ACTIVITIES_MISSING" &&
          issue.message.startsWith("Day 1:"),
      ),
    ).toBe(false);
  });
});

describe("real model regression findings", () => {
  it("does not charge an invented contingency after removing model prices", () => {
    const p = plan();
    p.budget_breakdown.contingency = 200;
    const result = reconcileBudget(enrichTravel(p, cities));
    expect(result.total_cost).toBe(0);
    expect(result.budget_breakdown.contingency).toBe(0);
  });
  it("does not count a standalone transfer's own travel duration twice", () => {
    const p = plan();
    p.days[0]!.activities = [
      {
        name: "Breakfast",
        kind: "meal",
        meal_slot: "breakfast",
        time: "08:00",
        duration: "1h",
        description: "",
        category: "food",
        currency: "VND",
        cost: null,
        maps_link: "",
      },
      {
        name: "Transfer",
        kind: "transfer",
        time: "09:00",
        duration: "30m",
        travel_minutes: 30,
        description: "",
        category: "transport",
        currency: "VND",
        cost: null,
        maps_link: "",
      },
      {
        name: "Museum",
        kind: "visit",
        time: "09:30",
        duration: "1h",
        travel_minutes: 0,
        description:
          "Explore the exhibits in the museum and focus on the local history collection, allowing enough time for a relaxed visit.",
        category: "attraction",
        currency: "VND",
        cost: null,
        maps_link: "",
      },
    ];
    expect(
      itineraryQuality(p).filter((issue) => issue.code === "SCHEDULE_CONFLICT"),
    ).toHaveLength(0);
  });
});

describe("source-backed planning estimates", () => {
  it("retains itemized allowances and multiplies person/room/night scopes once", () => {
    const p = plan();
    const allowance = (amount: number) => ({
      evidence: {
        source: "catalog" as const,
        verified_at: new Date().toISOString(),
      },
      amount,
      currency: "VND",
      scope: "person" as const,
      status: "estimated" as const,
      basis: "planning_estimate" as const,
      assumption:
        "Rounded planning allowance per traveler; not a confirmed live price.",
    });
    p.days[0]!.activities = [
      {
        name: "Breakfast",
        kind: "meal",
        meal_slot: "breakfast",
        time: "08:00",
        duration: "45m",
        description: "",
        cost: 15,
        currency: "VND",
        category: "food",
        maps_link: "",
        price: allowance(15),
      },
      {
        name: "Local rides allowance",
        kind: "transfer",
        time: "09:00",
        duration: "15m",
        description: "",
        cost: 8,
        currency: "VND",
        category: "transport",
        maps_link: "",
        price: allowance(8),
      },
      {
        name: "Return to hotel",
        kind: "transfer",
        time: "21:00",
        duration: "30m",
        description: "",
        cost: 0,
        currency: "VND",
        category: "transport",
        maps_link: "",
        price: allowance(0),
      },
    ];
    p.hotels = [
      {
        name: "Lodging area",
        city: "Da Nang",
        rooms: 1,
        nights: 1,
        nightly_estimate: 80,
        price: { ...allowance(80), scope: "room_night" },
        estimate_basis: "planning_estimate",
        estimate_assumption:
          "One double room for one night, approximate allowance.",
        price_per_night: "80 VND / room / night",
        price_range: "",
        booking_url: "",
        airbnb_url: "",
        address: "",
        maps_link: "",
      },
    ];
    p.transport_summary = [
      {
        segment: "Outbound",
        from: "Home",
        to: "Da Nang",
        recommended_mode: "flight",
        transport_kind: "flight",
        price: allowance(200),
        options: [],
      },
    ];
    const result = reconcileBudget(enrichTravel(p, cities));
    expect(result.days[0]!.activities[0]!.cost).toBe(30);
    expect(result.days[0]!.activities[0]!.price?.amount).toBe(15);
    expect(enrichTravel(result, cities).days[0]!.activities[0]!.cost).toBe(30);
    expect(result.budget_breakdown).toMatchObject({
      food: 30,
      transport: 416,
      accommodation: 80,
      contingency: 53,
      total: 579,
    });
    expect(result.days[0]!.activities[0]!.price?.basis).toBe(
      "planning_estimate",
    );
    expect(
      result.budget_breakdown.items?.find((item) => item.id === "contingency")
        ?.assumption,
    ).toContain("10%");
    expect(result.hotels[0]!.nightly_estimate).toBe(80);
  });
});

it("keeps the return transfer unknown and never charges a source-backed round-trip airfare twice", () => {
  const p = plan();
  const planning = createPlanningCriteria();
  planning.journey.return_to_origin = true;
  const price = {
    evidence: {
      source: "catalog" as const,
      verified_at: new Date().toISOString(),
    },
    amount: 600,
    currency: "VND",
    scope: "person" as const,
    status: "estimated" as const,
    basis: "planning_estimate" as const,
    assumption: "Dự trù vé máy bay khứ hồi, chưa phải báo giá.",
  };
  p.transport_summary = [
    {
      segment: "Flight",
      from: "Home",
      to: "Da Nang",
      recommended_mode: "flight",
      transport_kind: "flight",
      price,
      options: [],
    },
    {
      segment: "Airport transfer",
      from: "Airport",
      to: "Hotel",
      recommended_mode: "train",
      transport_kind: "airport_transfer",
      price: {
        ...price,
        amount: 25,
        assumption: "Khoản dự trù một chiều từ sân bay đến chỗ ở.",
      },
      options: [],
    },
  ];
  const result = reconcileBudget(
    enrichTravel(p, [], { planning, locale: "vi" } as ItineraryInput),
  );
  expect(result.transport_summary).toHaveLength(4);
  expect(result.budget_breakdown.transport).toBe(1250);
  expect(
    result.transport_summary.find((leg) => leg.from === "Hotel")?.price?.amount,
  ).toBeNull();
  expect(
    result.transport_summary.find((leg) => leg.from === "Da Nang")?.price
      ?.amount,
  ).toBe(0);
});
