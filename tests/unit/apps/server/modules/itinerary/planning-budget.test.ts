import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogFirstPlanner } from "../../../../../../apps/server/src/modules/itinerary/generation/catalog-first-planner";
import { workerRequestContext } from "../../../../../../apps/server/src/cloudflare/request-context";
import { catalogScenario } from "../../../../fixtures/catalog-scenario";
import {
  supplementBudget,
  budgetUnits,
} from "../../../../../../apps/server/src/modules/itinerary/generation/planning-budget";
import {
  prepareSnapshot,
  applySupplement,
  scheduleTravel,
} from "../../../../../../apps/server/src/modules/itinerary/generation/planning-data";
import {
  assembleDay,
  completePlan,
} from "../../../../../../apps/server/src/modules/itinerary/generation/planning-assembler";

afterEach(() => vi.unstubAllEnvs());

describe("budget-first selection", () => {
  it.each([true, false])(
    "persists a ten-day plan with affordable alternatives when available, warnings otherwise (alternatives=%s)",
    async (affordable) => {
      vi.stubEnv("AI_PROVIDER", "cloudflare");
      const { dto, cities } = catalogScenario();
      for (const city of cities) {
        city.places = [];
        city.activities = [];
      }
      const binding = {
        run: vi.fn(async (_model, payload) => {
          const prompt = payload.messages[1].content;
          expect(prompt).not.toContain(
            "an over-budget estimate is a valid response",
          );
          const context = JSON.parse(prompt.split("\n").at(-1));
          expect(context.budget_allocation.remaining_before_contingency).toBe(
            Math.floor(dto.budget! / 1.1),
          );
          const costs = {
            stay: 300000,
            leg: 500000,
            local: 20000,
            meal: 10000,
            cafe: 10000,
            visit: 0,
          };
          return {
            response: {
              cities: [],
              items: context.missing.map((need) => ({
                key: need.key,
                name: `Expensive ${need.key}`,
                amount: 10000000,
                duration_minutes: 60,
                alternatives: affordable
                  ? [
                      {
                        name: `Budget option ${need.key}`,
                        amount: costs[need.kind],
                        duration_minutes: 60,
                      },
                    ]
                  : [],
              })),
            },
          };
        }),
      };
      const store = {
        checkpoint: vi.fn(),
        save: vi.fn(),
        once: vi.fn(async (_id, work) => work()),
      };
      const repo = {
        findReusable: vi.fn(),
        createComplete: vi.fn().mockResolvedValue("budget-plan"),
      };
      const planner = new CatalogFirstPlanner(
        store as never,
        {
          byCountry: vi.fn(async (country) =>
            cities.filter((city) => city.country === country),
          ),
          findForPlanning: vi.fn(async (slug) =>
            cities.find((city) => city.slug === slug),
          ),
        } as never,
        repo as never,
        { query: vi.fn().mockResolvedValue({ rows: [] }) },
      );
      const generated = await workerRequestContext.run(
        { pool: {} as never, ai: binding },
        () =>
          planner.generate({
            userId: "user",
            dto,
            job: {
              id: "job",
              generation_id: "generation",
              claim_token: "claim",
            },
          }),
      );
      expect(generated.result.days).toHaveLength(10);
      expect(generated.result.budget_breakdown.complete).toBe(true);
      if (affordable) {
        expect(generated.result.total_cost).toBeLessThanOrEqual(dto.budget!);
      } else {
        expect(generated.result.total_cost).toBeGreaterThan(dto.budget!);
        expect(generated.result.issues).toContainEqual(
          expect.objectContaining({
            code: "OVER_BUDGET",
            severity: "warning",
            params: {
              amount: generated.result.total_cost - dto.budget!,
              currency: dto.currency,
            },
          }),
        );
      }
      expect(binding.run).toHaveBeenCalledOnce();
      expect(repo.createComplete).toHaveBeenCalledOnce();
    },
  );

  it("reserves retained charges and contingency, counting recurring meals and room nights", () => {
    const { input } = catalogScenario();
    input.planning!.stay_preferences.rooms = 2;
    const snapshot = prepareSnapshot(
      input,
      input.cities.map((selected) => ({ selected, country: "MY" })),
    );
    const allocation = supplementBudget(snapshot)!;
    const allocated = allocation.targets.reduce(
      (sum, target) =>
        sum + target.target_amount * target.group_units * target.keys.length,
      0,
    );
    expect(allocated).toBeGreaterThan(0);
    expect(
      (allocated + allocation.retained_group_cost) * 1.1,
    ).toBeLessThanOrEqual(input.budget!);
    const meal = snapshot.needs.find((need) => need.kind === "meal")!;
    expect(budgetUnits(snapshot, meal)).toBe(5 * input.num_travelers);
    const stay = snapshot.needs.find((need) => need.kind === "stay")!;
    expect(budgetUnits(snapshot, stay)).toBe(5 * 2);
  });

  it("selects cheaper travel and lodging proposals before rejecting the group budget", () => {
    const { input, destinations } = catalogScenario();
    const snapshot = prepareSnapshot(input, destinations);
    const leg = snapshot.legs[0]!;
    const stay = {
      key: `${destinations[0]!.selected}/stay`,
      destination: destinations[0]!.selected,
      kind: "stay" as const,
    };
    delete snapshot.items[leg.key];
    delete snapshot.items[stay.key];
    snapshot.needs = [leg, stay];
    applySupplement(snapshot, {
      items: [
        {
          key: leg.key,
          name: "Premium flight",
          amount: 10000000,
          duration_minutes: 60,
          alternatives: [
            { name: "Economy flight", amount: 500000, duration_minutes: 90 },
          ],
        },
        {
          key: stay.key,
          name: "Luxury district",
          amount: 5000000,
          alternatives: [
            { name: "Chinatown budget lodging area", amount: 300000 },
          ],
        },
      ],
    });
    expect(snapshot.items[leg.key]).toMatchObject({
      name: "Economy flight",
      amount: 500000,
      duration_minutes: 90,
    });
    expect(snapshot.items[stay.key]).toMatchObject({
      name: "Chinatown budget lodging area",
      amount: 300000,
    });
    scheduleTravel(snapshot);
    snapshot.days = snapshot.schedule.map((day) => assembleDay(snapshot, day));
    const plan = completePlan(snapshot);
    expect(plan.total_cost).toBeLessThanOrEqual(input.budget!);
    expect(plan.budget_breakdown.complete).toBe(true);
  });

  it("keeps confirmed prices and venue selections even when alternatives are cheaper", () => {
    const { input, destinations } = catalogScenario();
    const snapshot = prepareSnapshot(input, destinations);
    const leg = {
      ...snapshot.legs[0]!,
      fixed_amount: 500000,
      fixed_name: "Confirmed flight",
    };
    snapshot.needs = [leg];
    applySupplement(snapshot, {
      items: [
        {
          key: leg.key,
          name: "Confirmed flight",
          amount: 500000,
          duration_minutes: 60,
          alternatives: [
            { name: "Different flight", amount: 10000, duration_minutes: 120 },
          ],
        },
      ],
    });
    expect(snapshot.items[leg.key]!.amount).toBe(500000);
    expect(snapshot.items[leg.key]!.source).toBe("ai_suggestion");
  });

  it("never accepts a free unconfirmed fare as an alternative", () => {
    const { input, destinations } = catalogScenario();
    const snapshot = prepareSnapshot(input, destinations);
    const leg = snapshot.legs[0]!;
    delete snapshot.items[leg.key];
    snapshot.needs = [leg];
    expect(() =>
      applySupplement(snapshot, {
        items: [
          {
            key: leg.key,
            name: "Flight",
            amount: 500000,
            duration_minutes: 60,
            alternatives: [
              { name: "Free flight", amount: 0, duration_minutes: 60 },
            ],
          },
        ],
      }),
    ).not.toThrow();
    expect(snapshot.items[leg.key]).toMatchObject({
      name: "Flight",
      amount: 500000,
    });
  });

  it("returns meal and nightly cap overruns as warnings while preserving estimates", () => {
    const { input, destinations } = catalogScenario();
    const snapshot = prepareSnapshot(input, destinations);
    input.planning!.dining_preferences.per_person_budget = 100;
    input.planning!.stay_preferences.nightly_budget = 100;
    const mealKey = snapshot.schedule[0]!.slots.find(
      (slot) => slot.kind === "meal",
    )!.itemKey!;
    const stayKey = `${destinations[0]!.selected}/stay`;
    snapshot.needs = [
      { key: mealKey, destination: destinations[0]!.selected, kind: "meal" },
      { key: stayKey, destination: destinations[0]!.selected, kind: "stay" },
    ];
    snapshot.items[mealKey]!.amount = null;
    snapshot.items[stayKey]!.amount = null;
    applySupplement(snapshot, {
      items: [
        { key: mealKey, name: "Dining area", amount: 10000 },
        { key: stayKey, name: "Lodging area", amount: 300000 },
      ],
    });
    snapshot.days = snapshot.schedule.map((day) => assembleDay(snapshot, day));
    const plan = completePlan(snapshot);
    expect(plan.hotels[0]!.nightly_estimate).toBe(300000);
    expect(plan.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MEAL_ESTIMATE_OVER_BUDGET",
          severity: "warning",
        }),
        expect.objectContaining({
          code: "STAY_ESTIMATE_OVER_BUDGET",
          severity: "warning",
        }),
      ]),
    );
  });
});
