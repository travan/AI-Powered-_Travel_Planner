import { describe, expect, it, vi } from "vitest";
import { hasPriceEvidence, type ScopedPrice } from "@travel/types";
import {
  convertCatalogPrices,
  convertPlanPrices,
} from "../../../../../../apps/server/src/modules/itinerary/enrichment/catalog-prices";
import {
  prepareSnapshot,
  applySupplementForDisplay,
} from "../../../../../../apps/server/src/modules/itinerary/generation/planning-data";
import {
  assembleDay,
  completePlan,
} from "../../../../../../apps/server/src/modules/itinerary/generation/planning-assembler";
import {
  enrichTravel,
  reconcileBudget,
} from "../../../../../../apps/server/src/modules/itinerary/enrichment/travel-enrichment";
import { catalogScenario } from "../../../../fixtures/catalog-scenario";

const quote = () => ({
  from: "SGD",
  to: "VND",
  rate: 20000,
  updated_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  source_url: "https://example.test/rates",
});
function assembled() {
  const fixture = catalogScenario();
  const snapshot = prepareSnapshot(fixture.input, fixture.destinations);
  snapshot.days = snapshot.schedule.map((day) => assembleDay(snapshot, day));
  return { ...fixture, snapshot, plan: completePlan(snapshot) };
}
describe("price evidence and conversion", () => {
  it("converts catalog amounts before selection and retains price evidence independently of venue evidence", async () => {
    const fixture = catalogScenario();
    const original = structuredClone(fixture.cities);
    for (const city of fixture.cities)
      for (const price of city.activities) {
        price.currency = "SGD";
        price.estimated_cost! /= 20000;
      }
    const service = { quote: vi.fn(async () => quote()) };
    const cities = await convertCatalogPrices(fixture.cities, "VND", service);
    expect(service.quote).toHaveBeenCalledOnce();
    const snapshot = prepareSnapshot(
      fixture.input,
      fixture.destinations.map((d, i) => ({ ...d, city: cities[i] })),
    );
    snapshot.days = snapshot.schedule.map((day) => assembleDay(snapshot, day));
    const result = completePlan(snapshot);
    expect(result.total_cost).toBe(8250000);
    expect(result.budget_breakdown.complete).toBe(true);
    expect(result.hotels[0]?.price).toMatchObject({
      original: { amount: 15, currency: "SGD" },
      conversion: { rate: 20000 },
      evidence: { source: "catalog" },
    });
    expect(result.transport_summary[0]?.price?.original?.currency).toBe("SGD");
    expect(fixture.cities[0]?.activities[0]?.currency).toBe("SGD");
    expect(cities[0]?.activities[0]?.estimated_cost).toBe(
      original[0]?.activities[0]?.estimated_cost,
    );
  });
  it.each(["unavailable", "expired", "invalid"])(
    "excludes foreign prices when rates are %s",
    async (mode) => {
      const fixture = catalogScenario();
      fixture.cities[0]!.activities[0]!.currency = "SGD";
      const service = {
        quote: vi.fn(async () => {
          if (mode === "unavailable") throw new Error("offline");
          return {
            ...quote(),
            ...(mode === "expired"
              ? { expires_at: "2000-01-01" }
              : { rate: NaN }),
          };
        }),
      };
      const cities = await convertCatalogPrices(fixture.cities, "VND", service);
      expect(cities[0]!.activities[0]).toMatchObject({
        estimated_cost: null,
        price: { amount: null, original: { currency: "SGD", amount: 10000 } },
      });
      expect(fixture.cities[0]!.activities[0]!.estimated_cost).toBe(10000);
    },
  );
  it("does not treat model numbers, free claims, fabricated evidence or malformed response recovery as prices", () => {
    for (const amount of [null, 0, 150000, -1]) {
      const { input, destinations } = catalogScenario();
      destinations[0]!.city!.activities = [];
      const snapshot = prepareSnapshot(input, destinations);
      applySupplementForDisplay(snapshot, {
        items: snapshot.needs.map((need) => ({
          key: need.key,
          name: need.fixed_name ?? "Marina Bay Sands SkyPark",
          amount,
          duration_minutes: 60,
          evidence: {
            source: "catalog",
            verified_at: new Date().toISOString(),
          },
          url: "https://example.test/fake",
        })),
      });
      for (const need of snapshot.needs)
        expect(snapshot.items[need.key]?.amount).toBeNull();
      snapshot.days = snapshot.schedule.map((day) =>
        assembleDay(snapshot, day),
      );
      const result = completePlan(snapshot);
      expect(result.budget_breakdown.complete).toBe(false);
      expect(
        result.budget_breakdown.items
          ?.filter((item) => item.category === "food" && item.day_number === 1)
          .every((item) => item.amount === null),
      ).toBe(true);
      expect(
        result.days[0]!.activities.filter((a) => a.price?.included_in).every(
          (a) => a.price?.amount === null,
        ),
      ).toBe(true);
    }
  });
  it("keeps evidenced free visits and rejects expired or future-dated catalog prices", () => {
    const fixture = catalogScenario();
    const attraction = fixture.cities[0]!.activities[0]!;
    attraction.estimated_cost = 0;
    const snapshot = prepareSnapshot(fixture.input, fixture.destinations);
    const visit = Object.values(snapshot.items).find(
      (item) => item.name === attraction.title,
    )!;
    expect(visit.amount).toBe(0);
    expect(hasPriceEvidence(visit.price)).toBe(true);
    for (const date of ["2000-01-01", "2099-01-01"])
      expect(
        hasPriceEvidence({
          ...visit.price!,
          evidence: { source: "catalog", verified_at: date },
        }),
      ).toBe(false);
  });
  it("cleans legacy AI costs and totals on a copy without losing user-confirmed amounts", () => {
    const { plan } = assembled();
    for (const activity of plan.days.flatMap((day) => day.activities)) {
      if (activity.price) delete activity.price.evidence;
    }
    for (const hotel of plan.hotels)
      if (hotel.price) delete hotel.price.evidence;
    for (const leg of plan.transport_summary)
      if (leg.price) delete leg.price.evidence;
    const activity = plan.days[0]!.activities.find((a) => a.kind === "meal")!;
    activity.price = {
      amount: 150,
      scope: "person",
      status: "user_confirmed",
      currency: "VND",
    };
    const original = structuredClone(plan);
    const result = reconcileBudget(enrichTravel(plan, []));
    expect(result.budget_breakdown.food).toBe(300);
    expect(result.total_cost).toBe(300);
    expect(result.budget_breakdown.complete).toBe(false);
    expect(result.hotels[0]?.nightly_estimate).toBeUndefined();
    expect(plan).toEqual(original);
  });
  it("converts user prices once and leaves them unknown on rate failure", async () => {
    const { plan } = assembled();
    const price: ScopedPrice = {
      amount: 25,
      currency: "SGD",
      status: "user_confirmed",
      scope: "group",
      evidence: { source: "user" },
    };
    plan.days[0]!.activities[0]!.price = price;
    const service = { quote: vi.fn(async () => quote()) };
    const converted = await convertPlanPrices(plan, service);
    expect(converted.days[0]!.activities[0]!.price?.amount).toBe(500000);
    await convertPlanPrices(converted, service);
    expect(service.quote).toHaveBeenCalledOnce();
    const missing = await convertPlanPrices(plan, {
      quote: vi.fn().mockRejectedValue(new Error("offline")),
    });
    expect(missing.days[0]!.activities[0]!.cost).toBeNull();
    expect(missing.days[0]!.activities[0]!.price).toMatchObject({
      amount: null,
      original: { amount: 25, currency: "SGD" },
    });
    expect(price.amount).toBe(25);
  });
});

it("renews expired conversions from native prices and preserves zero included charges", async () => {
  const { plan } = assembled();
  const activity = plan.days[0]!.activities[0]!;
  activity.price = {
    amount: 500000,
    currency: "VND",
    scope: "group",
    status: "user_confirmed",
    evidence: { source: "user" },
    original: { amount: 25, currency: "SGD" },
    conversion: { ...quote(), expires_at: "2000-01-01" },
  };
  const included = plan.days[0]!.activities[1]!;
  included.price = {
    ...activity.price,
    amount: 0,
    included_in: "parent",
    original: { amount: 0, currency: "SGD" },
  };
  const result = await convertPlanPrices(plan, {
    quote: vi.fn(async () => ({ ...quote(), rate: 21000 })),
  });
  expect(result.days[0]!.activities[0]!.price?.amount).toBe(525000);
  expect(result.days[0]!.activities[1]!.price?.amount).toBe(0);
});

it("uses room price evidence rather than user venue evidence and sums selected stays without inventing missing nights", () => {
  const { plan } = assembled();
  const hotel = plan.hotels[0]!;
  const city = hotel.city_slug ?? hotel.city;
  const expectedNights = plan.days
    .slice(0, -1)
    .filter((d) => (d.city_slug ?? d.city) === city).length;
  hotel.evidence = { source: "user" };
  hotel.price = undefined;
  hotel.nightly_estimate = 999999;
  reconcileBudget(plan);
  expect(
    plan.budget_breakdown.items?.find((item) => item.id === `stay:${city}`)
      ?.amount,
  ).toBeNull();
  hotel.price = {
    amount: 100,
    currency: plan.currency,
    scope: "room_night",
    status: "user_confirmed",
    evidence: { source: "user" },
  };
  hotel.rooms = 2;
  hotel.nights = 1;
  plan.hotels.push({
    ...structuredClone(hotel),
    id: "another-stay",
    name: "Second user stay",
    nights: expectedNights - 1,
  });
  reconcileBudget(plan);
  const cityItems = plan.budget_breakdown.items?.filter((item) =>
    item.id.startsWith(`stay:${city}`),
  )!;
  expect(cityItems).toHaveLength(2);
  expect(cityItems.reduce((sum, item) => sum + (item.amount ?? 0), 0)).toBe(
    100 * 2 * expectedNights,
  );
  plan.hotels.pop();
  reconcileBudget(plan);
  expect(plan.budget_breakdown.missing_items).toContain(city);
});
