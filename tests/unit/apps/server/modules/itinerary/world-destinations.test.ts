import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { CatalogFirstPlanner } from "../../../../../../apps/server/src/modules/itinerary/generation/catalog-first-planner";
import { workerRequestContext } from "../../../../../../apps/server/src/cloudflare/request-context";
import { catalogScenario } from "../../../../fixtures/catalog-scenario";
const { ServiceUnavailableException } = createRequire(
  new URL("../../../../../../apps/server/package.json", import.meta.url),
)("@nestjs/common");

const destinations = [
  ["tokyo", "Tokyo", "JP", "Asia/Tokyo"],
  ["paris", "Paris", "FR", "Europe/Paris"],
  ["new-york", "New York", "US", "America/New_York"],
  ["london", "London", "GB", "Europe/London"],
  ["sydney", "Sydney", "AU", "Australia/Sydney"],
  ["cape-town", "Cape Town", "ZA", "Africa/Johannesburg"],
  ["rio-de-janeiro", "Rio de Janeiro", "BR", "America/Sao_Paulo"],
  ["cairo", "Cairo", "EG", "Africa/Cairo"],
  ["reykjavik", "Reykjavík", "IS", "Atlantic/Reykjavik"],
  ["da-nang", "Đà Nẵng", "VN", "Asia/Ho_Chi_Minh"],
  ["auckland", "Auckland", "NZ", "Pacific/Auckland"],
  ["singapore", "Singapore", "SG", "Asia/Singapore"],
] as const;
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function scenario(
  target: (typeof destinations)[number],
  kind: "city" | "country",
  mode: "catalog" | "prices" | "empty",
  independent = false,
) {
  vi.stubEnv("AI_PROVIDER", "cloudflare");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T00:00:00Z"));
  const { dto, cities } = catalogScenario();
  const [slug, name, country, timezone] = target;
  const city = structuredClone(cities[0]!);
  city.slug = slug;
  city.name = { en: name };
  city.country = country;
  city.timezone = timezone;
  const renamed = new Map(
    city.places.map((p, i) => [p.name, `${name} fixture venue ${i}`]),
  );
  for (const p of city.places) p.name = renamed.get(p.name)!;
  city.activities = city.activities.filter(
    (a) => !a.tags.some((t) => t.startsWith("route:")),
  );
  for (const a of city.activities) a.title = renamed.get(a.title) ?? a.title;
  for (const route of [`hanoi:${slug}`, `${slug}:hanoi`])
    city.activities.push({
      title: `Fixture route ${route}`,
      category: "transport",
      tags: [`route:${route}`],
      source: "verified_catalog",
      last_verified_at: new Date().toISOString(),
      estimated_cost: 500000,
      currency: "VND",
      duration_minutes: 60,
    });
  if (mode === "prices")
    city.activities = city.activities.filter(
      (a) => a.category !== "restaurant",
    );
  const selected =
    kind === "country" ? `country-${country.toLowerCase()}` : slug;
  dto.cities = [selected];
  dto.city_names = [name];
  dto.destination_refs = [{ id: selected, name, country, kind }];
  dto.planning!.journey.destinations = [selected];
  dto.planning!.dining_preferences.independent_only = independent;
  dto.num_days = 3;
  dto.end_date = "2027-01-03";
  let resolved = mode !== "empty";
  const cityService = {
    byCountry: vi.fn(async () => (resolved ? [city] : [])),
    findForPlanning: vi.fn(async () => (resolved ? city : undefined)),
    remember: vi.fn(async () => {
      resolved = true;
      return city;
    }),
  };
  const store = {
    checkpoint: vi.fn(),
    save: vi.fn(),
    once: vi.fn(async (_id, work) => work()),
  };
  const binding = {
    run: vi.fn(async (_model, payload) => {
      const context = JSON.parse(
        payload.messages[1].content.split("\n").at(-1),
      );
      return {
        response: {
          cities: [
            {
              destination: selected,
              name,
              country,
              lat: 999,
              timezone: "AI timezone must be ignored",
            },
          ],
          items: context.missing.map(
            (n: { key: string; kind: string; fixed_name?: string }) => ({
              key: n.key,
              name: n.fixed_name ?? `${name} suggestion ${n.key}`,
              amount:
                n.kind === "stay" ? 300000 : n.kind === "leg" ? 500000 : 10000,
              duration_minutes: 60,
            }),
          ),
        },
      };
    }),
  };
  const repository = {
    findReusable: vi.fn(),
    createComplete: vi.fn().mockResolvedValue("world-plan"),
  };
  const planner = new CatalogFirstPlanner(
    store as never,
    cityService as never,
    repository as never,
    { query: vi.fn().mockResolvedValue({ rows: [] }) },
  );
  const run = () =>
    workerRequestContext.run(
      { pool: {} as never, ai: binding, rawAi: binding },
      () =>
        planner.generate({
          userId: "user",
          dto,
          job: { id: "job", generation_id: "generation", claim_token: "claim" },
        }),
    );
  return {
    run,
    store,
    binding,
    repository,
    cityService,
    slug,
    timezone,
    country,
  };
}

// Synthetic catalog/pricing, inference and resolver fixtures. These are routing and
// validation regressions, not evidence of live coverage, realistic fares or model quality.
describe.each(["city", "country"] as const)("worldwide %s requests", (kind) => {
  it.each(destinations)(
    "%s reports resolver downtime separately from model or form errors",
    async (...target) => {
      const s = scenario(target, kind, "empty");
      s.cityService.remember.mockRejectedValue(
        new ServiceUnavailableException("provider unavailable"),
      );
      await expect(s.run()).rejects.toMatchObject({
        response: { code: "LOCATION_LOOKUP_UNAVAILABLE" },
        status: 503,
      });
      expect(s.binding.run).toHaveBeenCalledOnce();
      expect(s.repository.createComplete).not.toHaveBeenCalled();
    },
  );
  it.each(destinations)(
    "%s uses sufficient DB data without inference",
    async (...target) => {
      const s = scenario(target, kind, "catalog");
      const generated = await s.run();
      expect(generated.result.days).toHaveLength(3);
      expect(generated.result.days.every((d) => d.city_slug === s.slug)).toBe(
        true,
      );
      expect(generated.result.budget_breakdown.complete).toBe(true);
      expect(s.binding.run).not.toHaveBeenCalled();
    },
  );
  it.each(destinations)(
    "%s supplements missing prices once",
    async (...target) => {
      const s = scenario(target, kind, "prices");
      const generated = await s.run();
      expect(generated.result.days).toHaveLength(3);
      expect(s.binding.run).toHaveBeenCalledOnce();
      const payload = s.binding.run.mock.calls[0]![1];
      expect(
        payload.response_format.json_schema.properties.cities.items.properties
          .country.enum,
      ).toEqual([target[2]]);
      expect(payload.messages[1].content).toContain(
        "lodging neighborhood/district",
      );
      const variants =
        payload.response_format.json_schema.properties.items.items.anyOf;
      for (const variant of variants) {
        expect(variant.type).toBe("object");
        expect(variant.required).toEqual([
          "key",
          "name",
          "amount",
          "duration_minutes",
        ]);
        expect(variant.properties.name.type).toBe("string");
        expect(variant.properties.duration_minutes.type).toBe("integer");
      }
      expect(
        variants.some(
          (variant: any) =>
            variant.properties.amount.exclusiveMinimum === 0 &&
            variant.properties.key.enum.length > 0,
        ),
      ).toBe(true);
      expect(payload.messages[1].content).toContain(
        "Prioritize total_group_budget when selecting options",
      );
      expect(s.cityService.remember).not.toHaveBeenCalled();
    },
  );
  it.each(destinations)(
    "%s resolves a new destination using resolver data rather than AI geography",
    async (...target) => {
      const s = scenario(target, kind, "empty");
      const generated = await s.run();
      expect(generated.result.days).toHaveLength(3);
      expect(s.binding.run).toHaveBeenCalledOnce();
      expect(s.cityService.remember).toHaveBeenCalledOnce();
      expect(generated.result.city_catalog?.[s.slug]?.timezone).toBe(
        s.timezone,
      );
      expect(generated.result.issues).toContainEqual(
        expect.objectContaining({ code: "AI_SUGGESTIONS_UNVERIFIED" }),
      );
      expect(
        s.repository.createComplete.mock.calls[0]![0].catalogCities,
      ).toEqual([]);
    },
  );
  it.each(destinations)(
    "%s completes with an explicit warning for unverified independent dining",
    async (...target) => {
      const s = scenario(target, kind, "empty", true);
      const generated = await s.run();
      expect(generated.result.days).toHaveLength(3);
      expect(generated.result.issues).toContainEqual(
        expect.objectContaining({
          code: "INDEPENDENT_DINING_UNVERIFIED",
          severity: "warning",
        }),
      );
      expect(s.binding.run).toHaveBeenCalledOnce();
      expect(s.repository.createComplete).toHaveBeenCalledOnce();
    },
  );
});
