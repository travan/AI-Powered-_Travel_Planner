import type { CityPlanningData } from "../../../apps/server/src/modules/cities/domain/city.entity";
import { generationInput } from "../../../apps/server/src/modules/itinerary/generation/generation-input";
import { malaysiaSingaporeRequest } from "./malaysia-singapore-request";
export function catalogScenario() {
  const dto = malaysiaSingaporeRequest();
  delete dto.flexible_month;
  dto.start_date = "2027-01-01";
  dto.end_date = "2027-01-10";
  const input = generationInput(dto);
  const makeCity = (slug: string, country: string): CityPlanningData => ({
    slug,
    name: { en: slug },
    country,
    currency: "VND",
    timezone: "Asia/Singapore",
    lat: 1,
    lon: 103,
    popular: false,
    places: [
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `${slug}-v${i}`,
        name: `${slug} venue ${i}`,
        category: "attraction",
        type: "attraction",
      })),
      ...["restaurant", "cafe", "hotel"].map((type) => ({
        id: `${slug}-${type}`,
        name: `${slug} ${type}`,
        category: type,
        type,
      })),
    ].map((p) => ({
      ...p,
      tags: ["independent"],
      source: "verified_catalog",
      last_verified_at: new Date().toISOString(),
      address: null,
      price_level: null,
      rating: null,
      opening_hours: {},
    })),
    activities: [],
  });
  const cities = [makeCity("kuala-lumpur", "MY"), makeCity("singapore", "SG")];
  for (const city of cities) {
    city.activities = city.places.map((p) => ({
      id: p.id,
      title: p.name,
      category: p.category,
      tags: [],
      source: "verified_catalog",
      last_verified_at: new Date().toISOString(),
      estimated_cost: p.type === "hotel" ? 300000 : 10000,
      currency: "VND",
      duration_minutes: 60,
    }));
    city.activities.push({
      title: "Local allowance",
      category: "transport",
      tags: ["local_transport"],
      source: "verified_catalog",
      last_verified_at: new Date().toISOString(),
      estimated_cost: 20000,
      currency: "VND",
      duration_minutes: 30,
    });
  }
  const routes = [
    "hanoi:kuala-lumpur",
    "kuala-lumpur:singapore",
    "singapore:hanoi",
  ];
  for (const route of routes)
    cities[0]!.activities.push({
      title: route,
      category: "transport",
      tags: [`route:${route}`],
      source: "verified_catalog",
      last_verified_at: new Date().toISOString(),
      estimated_cost: 500000,
      currency: "VND",
      duration_minutes: 60,
    });
  const destinations = input.cities.map((selected, i) => ({
    selected,
    country: cities[i]!.country,
    city: cities[i],
  }));
  return { dto, input, cities, destinations };
}
