import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareAIProvider } from "../../../../packages/ai/src/providers/cloudflare";
import { createAIProvider } from "../../../../packages/ai/src/index";
import { createPlanningCriteria, validatePlanning } from "@travel/types";
import { classifyJobError } from "../../../../apps/server/src/modules/itinerary/journey/planning-job-error";
import { malaysiaSingaporeRequest } from "../../fixtures/malaysia-singapore-request";

afterEach(() => vi.useRealTimers());

describe("Cloudflare AI provider", () => {
  it("requires the binding instead of returning mock output", () => {
    expect(() => createAIProvider("cloudflare")).toThrow("binding is required");
  });
  it("parses real binding output and requests JSON mode", async () => {
    const run = vi.fn().mockResolvedValue({ response: '{"cities":["hanoi"]}' });
    const provider = new CloudflareAIProvider({ run });
    expect(await provider.parseNaturalInput("Hanoi for 2 days", "en")).toEqual({
      cities: ["hanoi"],
    });
    expect(run.mock.calls[0][1]).toMatchObject({
      response_format: { type: "json_object" },
      temperature: 0.2,
    });
  });
  it("propagates quota errors and rejects invalid model output", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error("quota exceeded"))
      .mockResolvedValueOnce({ response: "[]" });
    const provider = new CloudflareAIProvider({ run });
    await expect(provider.parseNaturalInput("Hanoi", "en")).rejects.toThrow(
      "quota exceeded",
    );
    await expect(provider.parseNaturalInput("Hanoi", "en")).rejects.toThrow(
      "invalid JSON",
    );
  });

  it.each([401, 403])(
    "classifies Cloudflare REST authorization status %s without calling it an unknown inference",
    async (status) => {
      const run = vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error("Authentication error"), {
            status,
            code: 10000,
          }),
        );
      const provider = new CloudflareAIProvider({ run });
      await expect(
        provider.supplementRaw("test", "en", { type: "object" }),
      ).rejects.toMatchObject({ code: "AI_AUTH_INVALID" });
      expect(run).toHaveBeenCalledOnce();
    },
  );
  it("uses the requested duration for structured trips without a redundant model overview", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T00:00:00Z"));
    const request = malaysiaSingaporeRequest();
    expect(validatePlanning(request).valid).toBe(true);
    const run = vi.fn();
    const provider = new CloudflareAIProvider({ run });
    const overview = await provider.generateOverview(request, []);
    expect(overview.total_days).toBe(10);
    expect(overview.cities).toEqual(["Malaysia", "Singapore"]);
    expect(run).not.toHaveBeenCalled();
    expect(provider.getUsage()).toEqual([]);
  });
});

describe("cloud daily planning", () => {
  const input = {
    cities: ["hanoi"],
    num_days: 7,
    num_travelers: 2,
    currency: "USD",
    trip_style: "mid_range" as const,
    locale: "en",
  };
  const overview = {
    title: "Hanoi",
    overview: "",
    cities: ["Hanoi"],
    total_days: 7,
    day_plan: [],
    estimated_budget: { min: 0, max: 0, currency: "USD" },
  };
  function binding(incomplete = false) {
    return vi.fn(async (_model, request) => {
      const schema = request.response_format.json_schema;
      if (schema.properties.days)
        return {
          response: {
            title: "A varied week",
            overview: "A provisional plan.",
            days: Array.from({ length: 7 }, (_, i) => ({
              day_number: i + 1,
              city: "Hanoi",
              title: `Area ${i + 1}`,
              places: Array.from({ length: 4 }, (_, j) => `Venue ${i}-${j}`),
              all_day: false,
            })),
            hotels: [],
            transport_summary: [],
          },
          usage: {
            prompt_tokens: 100,
            completion_tokens: 200,
            total_tokens: 300,
          },
        };
      if (incomplete) return { response: { activities: {} } };
      const activities = Object.fromEntries(
        Object.entries(schema.properties.activities.properties).map(
          ([id, s]: [string, any]) => [
            id,
            {
              name: s.properties.name.const ?? id,
              description:
                "Walk through the named neighborhood and focus on the local details along this carefully selected route. This fits the day without unnecessary backtracking and leaves time for a comfortable break. Bring water and prepare for the following stop before leaving.",
              reason: "Fits the route.",
              alternative: "",
              travel_minutes: null,
              price: {
                amount: s.properties.price.properties.amount.const ?? 10,
                currency: "USD",
                scope: "person",
                status: "estimated",
                basis: "planning_estimate",
                assumption:
                  "Rounded per-person planning allowance, not a live quote.",
              },
            },
          ],
        ),
      );
      return {
        response: { activities },
        usage: {
          prompt_tokens: 100,
          completion_tokens: 200,
          total_tokens: 300,
        },
      };
    });
  }
  it("uses the configured Workers AI binding and the same complete-day/price contracts, without local HTTP", async () => {
    const run = binding();
    const fetch = vi.fn(() => {
      throw Error("No local or external HTTP allowed in this provider test");
    });
    vi.stubGlobal("fetch", fetch);
    try {
      const provider = new CloudflareAIProvider(
        { run },
        "@cf/test/configured-cloud-model",
      );
      const result = await provider.generateDetail(input, overview, []);
      expect(result.days).toHaveLength(7);
      expect(
        result.days
          .flatMap((day) => day.activities)
          .filter((a) => a.kind === "meal"),
      ).toHaveLength(21);
      expect(
        new Set(
          result.days
            .flatMap((day) => day.activities)
            .filter((a) => a.kind === "visit")
            .map((a) => a.name),
        ).size,
      ).toBe(28);
      expect(run).toHaveBeenCalledTimes(8);
      expect(
        run.mock.calls.every(
          ([model, request]) =>
            model === "@cf/test/configured-cloud-model" &&
            request.response_format.type === "json_schema",
        ),
      ).toBe(true);
      expect(fetch).not.toHaveBeenCalled();
      expect(provider.getUsage()).toHaveLength(8);
      expect(result.days[0]!.activities[0]!.price).toMatchObject({
        amount: 10,
        basis: "planning_estimate",
        scope: "person",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("keeps the departure city explicit and accepts additions to a sparse catalog", async () => {
    const run = binding();
    const provider = new CloudflareAIProvider({ run });
    const { createPlanningCriteria } = await import("@travel/types");
    const planning = createPlanningCriteria();
    planning.journey.origin = {
      label: "Hà Nội",
      source: "manual",
      city_slug: "ha-noi",
    };
    planning.journey.destinations = ["busan", "seoul"];
    const destination = (city: string) =>
      ({
        city,
        places: [
          {
            name: `${city} museum`,
            source: "catalog",
            last_verified_at: "2026-11-01",
          },
        ],
        hotels: [],
        restaurants: [],
      }) as Parameters<typeof provider.generateDetail>[2][number];
    const result = await provider.generateDetail(
      { ...input, cities: ["busan", "seoul"], planning },
      { ...overview, cities: ["Busan", "Seoul"] },
      [destination("Busan"), destination("Seoul")],
    );
    const request = run.mock.calls[0]![1];
    expect(request.messages[1].content).toContain(
      '"origin":"Hà Nội","destinations":["Busan","Seoul"],"endpoint":"Hà Nội"',
    );
    expect(
      request.response_format.json_schema.properties.days.items.properties
        .places.items,
    ).toEqual({ type: "string" });
    expect(result.days).toHaveLength(7);
    expect(run).toHaveBeenCalledTimes(8);
  });
  it("rejects incomplete cloud output after repairing only the affected day", async () => {
    const run = binding(true);
    const provider = new CloudflareAIProvider({ run });
    await expect(provider.generateDetail(input, overview, [])).rejects.toThrow(
      "AI model returned incomplete day 1",
    );
    expect(run).toHaveBeenCalledTimes(3);
  });

  // Reproduce production's AI_DAY_INVALID with an otherwise valid request.
  // Only the model output changes between these cases.
  it.each([
    [
      "missing slot",
      "breakfast",
      "include exactly one",
      (rows: any) => {
        delete rows.breakfast;
      },
    ],
    [
      "short description",
      "breakfast",
      "at least 30 words",
      (rows: any) => {
        rows.breakfast.description = "Eat breakfast.";
      },
    ],
    [
      "null entry",
      "breakfast",
      "include exactly one",
      (rows: any) => {
        rows.breakfast = null;
      },
    ],
    [
      "wrong venue",
      "morning_1",
      "name and description must use exactly",
      (rows: any) => {
        rows.morning_1.name = "Another venue";
      },
    ],
    [
      "wrong currency",
      "breakfast",
      "correct currency/scope",
      (rows: any) => {
        rows.breakfast.price.currency = "VND";
      },
    ],
    [
      "non-text price assumption",
      "breakfast",
      "correct currency/scope",
      (rows: any) => {
        rows.breakfast.price.assumption = 123;
      },
    ],
    [
      "double-counted return fare",
      "return",
      "amount must be 0",
      (rows: any) => {
        rows.return.price.amount = 10;
      },
    ],
  ] as const)(
    "fails on %s after a day repair, with valid user input",
    async (_label, slot, problem, corrupt) => {
      const planning = createPlanningCriteria();
      planning.journey.origin = { label: "Da Nang", source: "manual" };
      planning.journey.destinations = input.cities;
      const request = { ...input, planning };
      expect(validatePlanning(request).valid).toBe(true);

      const healthy = binding();
      const run = vi.fn(async (model, payload) => {
        const output = await healthy(model, payload);
        if ("activities" in output.response) {
          // The repair schema contains only invalid slots.
          if (slot in output.response.activities)
            corrupt(output.response.activities);
        }
        return output;
      });
      const provider = new CloudflareAIProvider({ run });
      const failure = await provider
        .generateDetail(request, overview, [])
        .catch((error) => error);

      expect(failure).toMatchObject({ code: "AI_DAY_INVALID" });
      expect(run).toHaveBeenCalledTimes(3); // Outline, first day, repair of that day.
      const repair = run.mock.calls[2]![1].messages[1].content;
      expect(repair).toContain("Repair ONLY this day");
      expect(repair).toContain(`${slot}:`);
      expect(repair).toContain(problem);
      expect(
        Object.keys(
          run.mock.calls[2]![1].response_format.json_schema.properties
            .activities.properties,
        ),
      ).toEqual([slot]);
      expect(failure.details).toMatchObject({
        day: 1,
        issues: [{ slot, code: expect.any(String) }],
      });
      expect(classifyJobError(failure, "detail", "generate")).toMatchObject({
        code: "AI_DAY_INVALID",
        terminal: true,
        status: 422,
        params: {},
      });
      expect(provider.getUsage().map((entry) => entry.phase)).toEqual([
        "outline",
        "day",
        "day_repair",
      ]);
    },
  );

  it("completes a valid request when the model repairs its first incomplete day", async () => {
    const planning = createPlanningCriteria();
    planning.journey.origin = { label: "Da Nang", source: "manual" };
    planning.journey.destinations = input.cities;
    const request = { ...input, planning };
    expect(validatePlanning(request).valid).toBe(true);
    const healthy = binding();
    let incomplete = true;
    const run = vi.fn(async (model, payload) => {
      const output = await healthy(model, payload);
      if (incomplete && "activities" in output.response) {
        delete output.response.activities.breakfast;
        incomplete = false;
      } else if (
        "activities" in output.response &&
        payload.messages[1].content.includes("Repair ONLY this day")
      ) {
        // Even if a model ignores the narrow repair schema, valid entries stay intact.
        output.response.activities.morning_1 = {
          name: "Unexpected replacement",
        };
      }
      return output;
    });
    const provider = new CloudflareAIProvider({ run });
    const result = await provider.generateDetail(request, overview, []);
    expect(result.days).toHaveLength(7);
    expect(run).toHaveBeenCalledTimes(9); // Outline, seven days, one repair.
    const repair = run.mock.calls[2]![1];
    expect(
      Object.keys(
        repair.response_format.json_schema.properties.activities.properties,
      ),
    ).toEqual(["breakfast"]);
    expect(repair.max_tokens).toBeLessThan(run.mock.calls[1]![1].max_tokens);
    expect(
      result.days[0]!.activities.find((a) => a.kind === "visit")?.name,
    ).toBe("Venue 0-0");
  });
});
