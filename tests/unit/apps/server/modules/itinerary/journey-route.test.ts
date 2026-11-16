import { describe, expect, it } from "vitest";
import {
  createPlanningCriteria,
  itineraryRoute,
  localizedPlan,
  routeLabels,
  type Itinerary,
  type ItineraryInput,
} from "@travel/types";
import { itineraryRouteIssues } from "../../../../../../apps/server/src/modules/itinerary/enrichment/travel-enrichment";
import type { CityPlanningData } from "../../../../../../apps/server/src/modules/cities/domain/city.entity";
import { malaysiaSingaporeRequest } from "../../../../fixtures/malaysia-singapore-request";

const cities = [
  { slug: "ha-noi", name: { en: "Hanoi", vi: "Hà Nội" } },
  { slug: "beijing", name: { en: "Beijing", vi: "Bắc Kinh" } },
  { slug: "moscow", name: { en: "Moscow", vi: "Moskva" } },
] as CityPlanningData[];
const catalog = Object.fromEntries(
  cities.map(({ slug, name }) => [slug, { name }]),
);
const leg = (from: string, to: string) => ({
  from,
  to,
  segment: `${from} → ${to}`,
  recommended_mode: "flight" as const,
  options: [],
});
const day = (city: string) => ({ city, activities: [] });

function fixture() {
  const planning = createPlanningCriteria();
  planning.journey.origin = { label: "Ha Noi", source: "manual" };
  planning.journey.destinations = ["beijing", "moscow"];
  const plan = {
    planning,
    city_catalog: catalog,
    days: [day("Bắc Kinh"), day("Moscow")],
    transport_summary: [
      leg("Hanoi", "HAN"),
      leg("HAN", "Beijing"),
      leg("Beijing", "Moskva"),
      leg("Moscow", "Hà Nội"),
    ],
  } as unknown as Itinerary;
  const input: ItineraryInput = {
    planning,
    cities: planning.journey.destinations,
    currency: "VND",
    trip_style: "mixed",
    locale: "vi",
    num_travelers: 2,
  };
  return { plan, input };
}

describe("confirmed journey route", () => {
  it("accepts concrete cities inside selected countries without a whole-trip repair", () => {
    const input = malaysiaSingaporeRequest();
    const plan = {
      days: [
        { ...day("Kuala Lumpur"), destination_slug: "country-my" },
        { ...day("Singapore"), destination_slug: "country-sg" },
      ],
      transport_summary: [
        leg("Hà Nội", "Kuala Lumpur"),
        leg("Kuala Lumpur", "Singapore"),
        leg("Singapore", "Hà Nội"),
      ],
    } as unknown as Itinerary;
    expect(itineraryRouteIssues(plan, input, [])).toEqual([]);
    plan.days.reverse();
    expect(
      itineraryRouteIssues(plan, input, []).map((issue) => issue.code),
    ).toContain("JOURNEY_DAY_ORDER");
    plan.days.reverse();
    plan.transport_summary.pop();
    expect(
      itineraryRouteIssues(plan, input, []).map((issue) => issue.code),
    ).toContain("JOURNEY_LEG_MISSING");
  });

  it("rejects a country association that conflicts with a known city", () => {
    const input = malaysiaSingaporeRequest();
    const plan = {
      days: [
        { ...day("Hanoi"), destination_slug: "country-my" },
        { ...day("Singapore"), destination_slug: "country-sg" },
      ],
      transport_summary: [],
    } as unknown as Itinerary;
    expect(
      itineraryRouteIssues(plan, input, [{ ...cities[0]!, country: "VN" }]).map(
        (issue) => issue.code,
      ),
    ).toContain("JOURNEY_DAY_ORDER");
  });

  it("uses the requested stops and localizes city aliases without adding extra returns", () => {
    const { plan } = fixture();
    plan.days.push({ ...plan.days[0]!, city: "Hà Nội" });
    expect(routeLabels(itineraryRoute(plan), "vi")).toEqual([
      "Hà Nội",
      "Bắc Kinh",
      "Moskva",
      "Hà Nội",
    ]);
    expect(routeLabels(itineraryRoute(plan), "en")).toEqual([
      "Hanoi",
      "Beijing",
      "Moscow",
      "Hanoi",
    ]);
    expect(localizedPlan(plan, "en").days.map((d) => d.city)).toEqual([
      "Beijing",
      "Moscow",
      "Hanoi",
    ]);
    expect(localizedPlan(plan, "vi").transport_summary[2]?.segment).toBe(
      "Bắc Kinh → Moskva",
    );
  });

  it("keeps a named departure hub distinct from its surrounding city", () => {
    const { plan } = fixture();
    plan.planning!.journey.origin = {
      label: "Noi Bai Airport",
      city_slug: "ha-noi",
      source: "catalog",
    };
    expect(routeLabels(itineraryRoute(plan), "vi")).toEqual([
      "Noi Bai Airport",
      "Bắc Kinh",
      "Moskva",
      "Noi Bai Airport",
    ]);
  });

  it("checks destination order and directed paths between stops, including a different endpoint", () => {
    const { plan, input } = fixture();
    expect(itineraryRouteIssues(plan, input, cities)).toEqual([]);
    plan.days.reverse();
    expect(
      itineraryRouteIssues(plan, input, cities).map((issue) => issue.code),
    ).toEqual(["JOURNEY_DAY_ORDER"]);
    plan.days.reverse();
    plan.planning!.journey.return_to_origin = false;
    plan.planning!.journey.endpoint = { label: "Paris", source: "manual" };
    expect(routeLabels(itineraryRoute(plan), "en").at(-1)).toBe("Paris");
    expect(itineraryRouteIssues(plan, input, cities)).toMatchObject([
      { code: "JOURNEY_LEG_MISSING", params: { from: "Moskva", to: "Paris" } },
    ]);
    plan.transport_summary.push(leg("Moscow", "Paris"));
    expect(itineraryRouteIssues(plan, input, cities)).toEqual([]);
  });
});
