import { describe, expect, it, vi } from "vitest";
import { CloudflareAIProvider } from "../../../../../../packages/ai/src/providers/cloudflare";
import { createPlanningCriteria } from "../../../../../../packages/types/src/journey";
import {
  buildCatalogItinerary,
  type CatalogJob,
} from "../../../../../../apps/server/src/modules/itinerary/application/catalog-itinerary";
import { classifyJobError } from "../../../../../../apps/server/src/modules/itinerary/journey/planning-job-error";
import {
  itineraryQuality,
  itineraryRouteIssues,
} from "../../../../../../apps/server/src/modules/itinerary/enrichment/travel-enrichment";
import type { CityPlanningData } from "../../../../../../apps/server/src/modules/cities/domain/city.entity";
import type { ItineraryInput } from "../../../../../../packages/types/src/itinerary";

function fixture(days: number, missingVisits = 0) {
  const planning = createPlanningCriteria();
  planning.journey.origin = { label: "Hanoi", source: "manual" };
  planning.journey.destinations = ["busan"];
  planning.stay_preferences.type = "none";
  planning.dining_preferences.cafe = "none";
  planning.dining_preferences.independent_only = false;
  const input: ItineraryInput = {
    cities: ["busan"],
    num_days: days,
    num_travelers: 1,
    planning,
    trip_style: "mixed",
    locale: "en",
    currency: "USD",
  };
  const city: CityPlanningData = {
    slug: "busan",
    name: { en: "Busan" },
    country: "KR",
    currency: "USD",
    timezone: "Asia/Seoul",
    lat: null,
    lon: null,
    popular: false,
    activities: [],
    places: [
      ["attraction", 4 * days - missingVisits],
      ["restaurant", 3 * days],
      ["cafe", days],
    ].flatMap(([category, total]) =>
      Array.from({ length: Number(total) }, (_, i) => ({
        id: `${category}-${i}`,
        name: `${category}-${i}`,
        type: String(category),
        category: String(category),
        address: null,
        tags: [],
        price_level: null,
        rating: null,
        opening_hours: {},
        last_verified_at: new Date().toISOString(),
        source: "seed",
      })),
    ),
  };
  const job: CatalogJob = {
    id: "seed",
    progress: { days: [] },
    save: vi.fn(),
    templates: vi.fn().mockResolvedValue([]),
    usage: vi.fn(),
  };
  return { input, city, job };
}

describe("catalog itinerary generation", () => {
  it.each([1, 3, 10])(
    "builds a %s-day itinerary without initializing AI",
    async (days) => {
      const { input, city, job } = fixture(days);
      const provider = vi.fn();
      const plan = await buildCatalogItinerary(input, [city], job, provider);
      expect(plan.days).toHaveLength(days);
      expect(provider).not.toHaveBeenCalled();
      expect(itineraryRouteIssues(plan, input, [city])).toEqual([]);
      expect(
        itineraryQuality(plan, input).map((issue) => issue.code),
      ).not.toEqual(expect.arrayContaining(["SCHEDULE_CONFLICT"]));
    },
  );

  it("resumes day 7 and sends only the missing slot", async () => {
    const { input, city, job } = fixture(7, 1);
    const run = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("temporary"), { status: 503 }),
      );
    const ai = new CloudflareAIProvider({ run });
    await expect(
      buildCatalogItinerary(input, [city], job, () => ai),
    ).rejects.toThrow("temporary");
    expect(job.progress.days.map((day) => day.day_number)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    const stored = structuredClone(job.progress.days);
    run.mockImplementationOnce(async (_model, request) => ({
      response: {
        slots: Object.fromEntries(
          request.response_format.json_schema.properties.slots.required.map(
            (slot: string) => [
              slot,
              {
                name: "New Busan attraction",
                description: "Check the official venue information.",
                amount: 5,
              },
            ],
          ),
        ),
      },
      usage: { prompt_tokens: 30, completion_tokens: 20 },
    }));
    const result = await buildCatalogItinerary(input, [city], job, () => ai);
    expect(result.days.slice(0, 6)).toEqual(stored);
    expect(
      run.mock.calls[1]![1].response_format.json_schema.properties.slots
        .required,
    ).toHaveLength(1);
    expect(
      result.days[6]!.activities.some(
        (item) => item.evidence?.source === "ai_suggestion",
      ),
    ).toBe(true);
  });

  it("records quota rejection and terminates without another AI call", async () => {
    const { input, city, job } = fixture(1, 1);
    const run = vi.fn().mockRejectedValue(new Error("4006: daily quota"));
    const ai = new CloudflareAIProvider({ run });
    const failure = await buildCatalogItinerary(
      input,
      [city],
      job,
      () => ai,
    ).catch((error) => error);
    expect(classifyJobError(failure, "detail", "generate")).toMatchObject({
      code: "AI_QUOTA_EXHAUSTED",
      terminal: true,
      params: { retry_at: expect.stringMatching(/T00:00:00\.000Z$/) },
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(job.usage).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "quota_rejected",
        input_tokens: null,
        output_tokens: null,
      }),
      1,
    );
  });
});
