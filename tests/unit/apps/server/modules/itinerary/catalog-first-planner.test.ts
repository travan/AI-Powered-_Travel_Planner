import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogFirstPlanner } from "../../../../../../apps/server/src/modules/itinerary/generation/catalog-first-planner";
import {
  prepareSnapshot,
  scheduleTravel,
  type Snapshot,
  applySupplement,
  validateSupplementRequirements,
} from "../../../../../../apps/server/src/modules/itinerary/generation/planning-data";
import {
  completePlan,
  assembleDay,
} from "../../../../../../apps/server/src/modules/itinerary/generation/planning-assembler";
import { workerRequestContext } from "../../../../../../apps/server/src/cloudflare/request-context";
import { catalogScenario } from "../../../../fixtures/catalog-scenario";
import travelCheckpoint from "../../../../fixtures/malaysia-singapore-travel-checkpoint.json";
import realSupplement from "../../../../fixtures/malaysia-singapore-supplement.json";
import { generationInput } from "../../../../../../apps/server/src/modules/itinerary/generation/generation-input";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function fixture() {
  vi.stubEnv("AI_PROVIDER", "cloudflare");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T00:00:00Z"));
  return catalogScenario();
}

describe("catalog-first generation v2", () => {
  it("assembles the recorded 4h/5h/6h travel response without dropping required meals or evenings", () => {
    const snapshot = structuredClone(travelCheckpoint) as unknown as Snapshot;
    scheduleTravel(snapshot);
    snapshot.days = snapshot.schedule.map((day) => assembleDay(snapshot, day));
    const plan = completePlan(snapshot);
    expect(plan.days).toHaveLength(10);
    expect(plan.total_cost).toBe(57893000);
    expect(plan.budget_breakdown.complete).toBe(true);
    expect(
      plan.issues?.some((i) =>
        ["MEAL_MISSING", "EVENING_MISSING", "SCHEDULE_CONFLICT"].includes(
          i.code,
        ),
      ),
    ).toBe(false);
    const last = snapshot.schedule.at(-1)!;
    expect(last.slots.find((s) => s.coveredBy === "leg/3")).toMatchObject({
      time: "18:00",
      duration_minutes: 360,
    });
    expect(last.slots.find((s) => s.meal_slot === "dinner")?.time).toBe(
      "17:00",
    );
    for (const day of snapshot.schedule)
      for (const slot of day.slots) {
        const [h, m] = slot.time.split(":").map(Number);
        expect(h! * 60 + m! + slot.duration_minutes).toBeLessThanOrEqual(1440);
      }
    const scheduled = structuredClone(snapshot.schedule);
    scheduleTravel(snapshot);
    expect(snapshot.schedule).toEqual(scheduled);
  });
  it("does not move a confirmed departure to fit an overlong return leg", () => {
    const snapshot = structuredClone(travelCheckpoint) as unknown as Snapshot;
    snapshot.input.planning!.transport_preferences.departure_at =
      "2027-01-10T19:00";
    expect(() => scheduleTravel(snapshot)).toThrow("main travel does not fit");
  });
  it("softens independent dining without softening allergy requirements", () => {
    const { input } = fixture();
    input.planning!.dining_preferences.independent_only = true;
    const snapshot = prepareSnapshot(
      input,
      input.cities.map((selected) => ({ selected, country: "MY" })),
    );
    const meal = snapshot.needs.find((need) => need.kind === "meal")!;
    snapshot.needs = [meal];
    snapshot.items[meal.key] = {
      name: "Suggested dining area",
      amount: 100000,
      source: "ai_suggestion",
      scope: "person",
      assumption: "Unverified allowance",
    };
    expect(() => validateSupplementRequirements(snapshot)).not.toThrow();
    input.planning!.dining_preferences.allergies = ["peanut"];
    expect(() => validateSupplementRequirements(snapshot)).toThrow();
  });
  it("supports a legacy destination-only day without inventing an external origin or fare", async () => {
    const { dto, cities } = fixture();
    delete dto.planning;
    delete dto.destination_refs;
    dto.cities = [cities[0]!.slug];
    dto.city_names = [cities[0]!.name.en!];
    dto.num_days = 1;
    dto.end_date = dto.start_date;
    const store = { checkpoint: vi.fn(), save: vi.fn(), once: vi.fn() };
    const cityService = { findForPlanning: vi.fn(async () => cities[0]) };
    const repo = {
      findReusable: vi.fn(),
      createComplete: vi.fn().mockResolvedValue("legacy-plan"),
    };
    const planner = new CatalogFirstPlanner(
      store as never,
      cityService as never,
      repo as never,
      { query: vi.fn().mockResolvedValue({ rows: [] }) },
    );
    const result = await planner.generate({
      userId: "u",
      dto,
      job: { id: "j", generation_id: "g", claim_token: "c" },
    });
    expect(result.result.days).toHaveLength(1);
    expect(result.result.hotels).toHaveLength(0);
    expect(result.result.budget_breakdown.complete).toBe(true);
    expect(result.result.issues).toContainEqual(
      expect.objectContaining({ code: "LEGACY_DESTINATION_ROUTE" }),
    );
    expect(store.once).not.toHaveBeenCalled();
  });

  it("rejects invalid legacy calendar dates before scheduling", () => {
    const { dto } = fixture();
    delete dto.planning;
    dto.start_date = "2027-02-30";
    expect(() => generationInput(dto)).toThrow();
  });
  it("rejects the production model's zero international fares rather than inventing affordability", () => {
    const { input } = fixture();
    const snapshot = prepareSnapshot(
      input,
      input.cities.map((selected) => ({
        selected,
        country: selected.endsWith("my") ? "MY" : "SG",
      })),
    );
    snapshot.needs = snapshot.legs;
    expect(() =>
      applySupplement(snapshot, {
        items: snapshot.legs.map((leg) => ({
          key: leg.key,
          name: `${leg.from} to ${leg.to}`,
          amount: 0,
          duration_minutes: 240,
        })),
      }),
    ).toThrow("missing mandatory cost");
  });
  it("retains the recorded real-model estimate even when mandatory travel/stay exceeds budget", () => {
    const { input } = fixture();
    const snapshot = prepareSnapshot(
      input,
      input.cities.map((selected) => ({
        selected,
        country: selected.endsWith("my") ? "MY" : "SG",
      })),
    );
    applySupplement(snapshot, realSupplement);
    expect(snapshot.items["country-my/stay"]!.amount).toBe(1500000);
    expect(snapshot.items["leg/1"]!.amount).toBe(2000000);
  });
  it("assembles the ten-day FE payload entirely from priced DB data", () => {
    const { input, destinations } = fixture();
    const snapshot = prepareSnapshot(input, destinations);
    expect(snapshot.needs).toEqual([]);
    snapshot.days = snapshot.schedule.map((day) => assembleDay(snapshot, day));
    const plan = completePlan(snapshot);
    expect(plan.days).toHaveLength(10);
    expect(plan.total_cost).toBeLessThan(20000000);
    expect(plan.budget_breakdown.complete).toBe(true);
    expect(plan.total_cost).toBe(8250000);
    expect(
      plan.days[0]!.activities.find(
        (a) => a.kind === "transfer",
      )?.description.split(/\s+/).length,
    ).toBeLessThan(30);
  });

  it("multiplies lodging by rooms and nights, and adds contingency once", () => {
    const { input, destinations } = fixture();
    input.planning!.stay_preferences.rooms = 2;
    const snapshot = prepareSnapshot(input, destinations);
    snapshot.days = snapshot.schedule.map((d) => assembleDay(snapshot, d));
    const plan = completePlan(snapshot);
    expect(plan.budget_breakdown.accommodation).toBe(5400000);
    expect(plan.total_cost).toBe(11220000);
  });

  it("blocks missing meals, overlapping stops and repeated venues", () => {
    const { input, destinations } = fixture();
    const snapshot = prepareSnapshot(input, destinations);
    snapshot.days = snapshot.schedule.map((d) => assembleDay(snapshot, d));
    const missing = structuredClone(snapshot);
    missing.days[0]!.activities = missing.days[0]!.activities.filter(
      (a) => a.meal_slot !== "lunch",
    );
    expect(() => completePlan(missing)).toThrow();
    const overlap = structuredClone(snapshot);
    overlap.days[0]!.activities[1]!.time = "07:30";
    expect(() => completePlan(overlap)).toThrow();
    const duplicate = structuredClone(snapshot);
    const first = duplicate.days[0]!.activities.find(
      (a) => a.kind === "visit",
    )!;
    duplicate.days[1]!.activities.find((a) => a.kind === "visit")!.name =
      first.name;
    expect(() => completePlan(duplicate)).toThrow();
  });

  it("retains catalog names while AI supplies only missing prices", () => {
    const { input, destinations } = fixture();
    destinations[0]!.city.activities = [];
    const snapshot = prepareSnapshot(input, destinations);
    const retained = Object.values(snapshot.items).find(
      (i) => i.source === "catalog",
    )!.name;
    applySupplement(snapshot, {
      items: snapshot.needs.map((n) => ({
        key: n.key,
        name: "AI should not replace catalog",
        amount: 10000,
        duration_minutes: 60,
      })),
    });
    expect(Object.values(snapshot.items).some((i) => i.name === retained)).toBe(
      true,
    );
  });

  it("does not call AI when catalog and templates are sufficient", async () => {
    const { dto, cities } = fixture();
    const store = {
      checkpoint: vi.fn().mockResolvedValue(undefined),
      save: vi.fn(),
      once: vi.fn(),
    };
    const cityService = {
      byCountry: vi.fn(async (country: string) =>
        cities.filter((c) => c.country === country),
      ),
      findForPlanning: vi.fn(async (slug: string) =>
        cities.find((c) => c.slug === slug),
      ),
    };
    const repo = {
      findReusable: vi.fn().mockResolvedValue(null),
      createComplete: vi.fn().mockResolvedValue("plan-id"),
    };
    const planner = new CatalogFirstPlanner(
      store as never,
      cityService as never,
      repo as never,
      { query: vi.fn().mockResolvedValue({ rows: [] }) },
    );
    await expect(
      planner.generate({
        userId: "user",
        dto,
        job: { id: "job", generation_id: "generation", claim_token: "claim" },
      }),
    ).resolves.toMatchObject({ itinerary_id: "plan-id" });
    expect(store.once).not.toHaveBeenCalled();
    expect(store.save).toHaveBeenCalledTimes(11);
  });

  it("uses one supplement and checkpoints every complete day", async () => {
    const { dto, cities } = fixture();
    cities[0]!.activities = [];
    let response: unknown;
    const binding = {
      run: vi.fn(async (_model: string, payload: Record<string, any>) => {
        const context = JSON.parse(
          payload.messages[1].content.split("\n").at(-1),
        );
        return {
          response: {
            cities: [],
            items: context.missing.map(
              (n: { key: string; fixed_name?: string }) => ({
                key: n.key,
                name: n.fixed_name ?? `Suggestion ${n.key}`,
                amount: n.key.includes("stay") ? 300000 : 10000,
                duration_minutes: 60,
              }),
            ),
          },
        };
      }),
    };
    const store = {
      checkpoint: vi.fn(),
      save: vi.fn(),
      once: vi.fn(async (_id, work) => {
        response ??= await work();
        return response;
      }),
    };
    const cityService = {
      byCountry: vi.fn(async (country: string) =>
        cities.filter((c) => c.country === country),
      ),
      findForPlanning: vi.fn(async (slug: string) =>
        cities.find((c) => c.slug === slug),
      ),
    };
    const repo = {
      findReusable: vi.fn().mockResolvedValue(null),
      createComplete: vi.fn().mockResolvedValue("plan-id"),
    };
    const planner = new CatalogFirstPlanner(
      store as never,
      cityService as never,
      repo as never,
      { query: vi.fn().mockResolvedValue({ rows: [] }) },
    );
    await workerRequestContext.run({ pool: {} as never, ai: binding }, () =>
      planner.generate({
        userId: "user",
        dto,
        job: { id: "job", generation_id: "generation", claim_token: "claim" },
      }),
    );
    expect(binding.run).toHaveBeenCalledOnce();
    expect(store.save).toHaveBeenCalledTimes(12);
  });

  it.each([true, false])("honors the canary allowlist when the primary quota is exhausted (allowed=%s)", async (allowed) => {
    const { dto, cities } = fixture();
    cities[0]!.activities = [];
    vi.stubEnv("AI_FALLBACK_CANARY_ONLY", "true");
    vi.stubEnv("PLANNING_CANARY_USER_IDS", "canary");
    vi.stubEnv("GEMINI_API_KEY_TEST", "test-only-gemini-key");
    vi.stubEnv("AI_FALLBACK_PROVIDERS", JSON.stringify([
      { id: "gemini-test", provider: "gemini", model: "test-model", key_env: "GEMINI_API_KEY_TEST" },
    ]));
    const request = vi.fn(async (_url, init) => {
      const prompt = JSON.parse(init.body).contents[0].parts[0].text;
      const context = JSON.parse(prompt.split("\n").at(-1));
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          cities: [],
          items: context.missing.map((need) => ({
            key: need.key,
            name: need.fixed_name ?? `Suggestion ${need.key}`,
            amount: need.key.includes("stay") ? 300000 : 10000,
            duration_minutes: 60,
          })),
        }) }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
      }));
    });
    vi.stubGlobal("fetch", request);
    const binding = { run: vi.fn(async () => { throw new Error("daily quota exhausted"); }) };
    const store = {
      checkpoint: vi.fn(), save: vi.fn(), recordUsage: vi.fn(async () => {}),
      once: vi.fn(async (_id, work, preflight) => {
        preflight();
        return work(new AbortController().signal);
      }),
    };
    const planner = new CatalogFirstPlanner(
      store as never,
      {
        byCountry: async (country) => cities.filter((city) => city.country === country),
        findForPlanning: async (slug) => cities.find((city) => city.slug === slug),
      } as never,
      { findReusable: vi.fn().mockResolvedValue(null), createComplete: vi.fn().mockResolvedValue("plan-id") } as never,
      { query: vi.fn().mockResolvedValue({ rows: [] }) },
    );
    const result = workerRequestContext.run({ pool: {} as never, ai: binding }, () => planner.generate({
      userId: allowed ? "canary" : "ordinary-user", dto,
      job: { id: "job", generation_id: "generation", claim_token: "claim" },
    }));
    if (allowed) {
      await expect(result).resolves.toMatchObject({ itinerary_id: "plan-id" });
      expect(request).toHaveBeenCalledOnce();
      expect(request.mock.calls[0][1].headers["x-goog-api-key"]).toBe("test-only-gemini-key");
      expect(store.recordUsage.mock.lastCall?.[1]).toMatchObject([
        { source_id: "primary", outcome: "quota_rejected" },
        { source_id: "gemini-test", provider: "gemini", total_tokens: 30, outcome: "received" },
      ]);
    } else {
      await expect(result).rejects.toMatchObject({ code: "AI_QUOTA_EXHAUSTED" });
      expect(request).not.toHaveBeenCalled();
    }
    expect(binding.run).toHaveBeenCalledOnce();
  });

  it("returns an over-budget plan with a warning while still rejecting a missing mandatory price", () => {
    const { input, destinations } = fixture();
    const snapshot = prepareSnapshot(input, destinations);
    snapshot.days = snapshot.schedule.map((d) => assembleDay(snapshot, d));
    snapshot.items["leg/1"]!.amount = 20000000;
    const plan = completePlan(snapshot);
    expect(plan.total_cost).toBeGreaterThan(input.budget!);
    expect(plan.issues).toContainEqual(expect.objectContaining({ code: "OVER_BUDGET", severity: "warning" }));
    snapshot.items["leg/1"]!.amount = null;
    expect(() => completePlan(snapshot)).toThrow();
  });

  it("uses the cache before choosing a flexible date or reading catalog data", async () => {
    const { dto, input, destinations } = fixture();
    const snapshot = prepareSnapshot(input, destinations);
    snapshot.days = snapshot.schedule.map((d) => assembleDay(snapshot, d));
    const plan = completePlan(snapshot);
    const store = { checkpoint: vi.fn(), once: vi.fn(), save: vi.fn() };
    const cities = { byCountry: vi.fn() };
    const repo = {
      findReusable: vi.fn().mockResolvedValue({ id: "cached", result: plan }),
    };
    const planner = new CatalogFirstPlanner(
      store as never,
      cities as never,
      repo as never,
      {} as never,
    );
    dto.flexible_month = "2027-01";
    delete dto.start_date;
    delete dto.end_date;
    expect(
      await planner.generate({
        userId: "u",
        dto,
        job: { id: "j", generation_id: "g", claim_token: "c" },
      }),
    ).toMatchObject({ itinerary_id: "cached", cache_hit: true });
    expect(cities.byCountry).not.toHaveBeenCalled();
    expect(store.once).not.toHaveBeenCalled();
  });

  it("resumes completed days after a persistence failure without another inference", async () => {
    const { dto, cities } = fixture();
    cities[0]!.activities = [];
    let checkpoint: unknown;
    const binding = {
      run: vi.fn(async (_model, payload) => {
        const context = JSON.parse(
          payload.messages[1].content.split("\n").at(-1),
        );
        return {
          response: {
            cities: [],
            items: context.missing.map((n) => ({
              key: n.key,
              name: n.fixed_name ?? `Suggestion ${n.key}`,
              amount: n.kind === "stay" ? 300000 : 10000,
              duration_minutes: 60,
            })),
          },
        };
      }),
    };
    const store = {
      checkpoint: vi.fn(async () => structuredClone(checkpoint)),
      save: vi.fn(async (_g, _j, _c, value) => {
        checkpoint = structuredClone(value);
      }),
      once: vi.fn(async (_g, work) => work()),
    };
    const cityService = {
      byCountry: vi.fn(async (country) =>
        cities.filter((c) => c.country === country),
      ),
      findForPlanning: vi.fn(async (slug) =>
        cities.find((c) => c.slug === slug),
      ),
    };
    const repo = {
      findReusable: vi.fn(),
      createComplete: vi
        .fn()
        .mockRejectedValueOnce(Error("DB unavailable"))
        .mockResolvedValue("persisted"),
    };
    const planner = new CatalogFirstPlanner(
      store as never,
      cityService as never,
      repo as never,
      { query: vi.fn().mockResolvedValue({ rows: [] }) },
    );
    const options = {
      userId: "u",
      dto,
      job: { id: "j", generation_id: "g", claim_token: "c" },
    };
    await workerRequestContext.run(
      { pool: {} as never, ai: binding },
      async () => {
        await expect(planner.generate(options)).rejects.toThrow(
          "DB unavailable",
        );
        await expect(planner.generate(options)).resolves.toMatchObject({
          itinerary_id: "persisted",
        });
      },
    );
    expect(binding.run).toHaveBeenCalledOnce();
    expect(store.once).toHaveBeenCalledOnce();
  });

  it("does not use a nightly spending cap as evidence of a room price", () => {
    const { input, destinations } = fixture();
    input.planning!.stay_preferences.nightly_budget = 500000;
    for (const d of destinations)
      d.city!.activities = d.city!.activities.filter(
        (a) => a.category !== "hotel",
      );
    const snapshot = prepareSnapshot(input, destinations);
    expect(snapshot.needs.filter((n) => n.kind === "stay")).toHaveLength(2);
  });

  it("rejects zero-priced mandatory AI costs and exposes AI pricing on retained venues", () => {
    const { input, destinations } = fixture();
    destinations[0]!.city.activities = [];
    const snapshot = prepareSnapshot(input, destinations);
    const rows = snapshot.needs.map((n) => ({
      key: n.key,
      name: n.fixed_name ?? n.key,
      amount: 10000,
      duration_minutes: 60,
    }));
    const mandatory = rows.find((r) => r.key.includes("stay"))!;
    mandatory.amount = 0;
    expect(() => applySupplement(snapshot, { items: rows })).toThrow(
      "mandatory cost",
    );
    mandatory.amount = 300000;
    applySupplement(snapshot, { items: rows });
    expect(snapshot.items[mandatory.key]!.source).toBe("ai_suggestion");
  });
});
