import { describe, expect, it, vi } from "vitest";
import { ItineraryService } from "../../../../../../apps/server/src/modules/itinerary/application/itinerary.service";
import type { ItineraryRepository } from "../../../../../../apps/server/src/modules/itinerary/domain/itinerary.repository";
import type { CitiesService } from "../../../../../../apps/server/src/modules/cities/application/cities.service";

function createRepository(
  saveAsTrip: ItineraryRepository["saveAsTrip"],
): ItineraryRepository {
  return {
    findVisible: vi.fn(),
    findForTrip: vi.fn(),
    findReusable: vi.fn().mockResolvedValue(null),
    createComplete: vi.fn(),
    recordFailure: vi.fn(),
    saveAsTrip,
  };
}

function createCitiesService(): CitiesService {
  return {
    remember: vi.fn(async (name: string) => ({
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      name: { en: name },
      country: "",
      timezone: "",
      currency: "",
      lat: null,
      lon: null,
      popular: false,
    })),
    findForPlanning: vi.fn().mockResolvedValue(null),
  } as unknown as CitiesService;
}

describe("ItineraryService.save", () => {
  it("returns the workspace trip id after saving", async () => {
    const repository = createRepository(
      vi.fn().mockResolvedValue({ tripId: "trip-1" }),
    );
    const service = new ItineraryService(repository, createCitiesService());

    await expect(
      service.save({ itineraryId: "itinerary-1", userId: "user-1" }),
    ).resolves.toEqual({
      ok: true,
      value: { saved: true, trip_id: "trip-1" },
    });
  });

  it("does not expose another user's itinerary", async () => {
    const repository = createRepository(vi.fn().mockResolvedValue(null));
    const service = new ItineraryService(repository, createCitiesService());

    await expect(
      service.save({ itineraryId: "itinerary-1", userId: "user-2" }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "not_found",
        statusCode: 404,
        message: "Itinerary not found",
      },
    });
  });
});

describe("ItineraryService.getForTrip", () => {
  it("returns the itinerary attached to a member trip", async () => {
    const itinerary = {
      id: "itinerary-1",
      userId: "user-1",
      title: "Tokyo Discovery",
      status: "complete",
      cities: ["tokyo"],
      numDays: 5,
      budget: 1200,
      currency: "USD",
      tripStyle: "culture",
      isPublic: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      result: {
        title: "Tokyo Discovery",
        overview: "A saved plan",
        total_cost: 1200,
        currency: "USD",
        num_days: 5,
        num_travelers: 1,
        seasonal_notes: {
          travel_month: "April",
          daylight_hours: "12h",
          sunrise_time: "06:00",
          sunset_time: "18:00",
          weather_note: "Mild",
          highlights: [],
          warnings: [],
        },
        transport_summary: [],
        days: [],
        hotels: [],
        restaurants: [],
        suggestions: [],
        budget_breakdown: {
          accommodation: 0,
          food: 0,
          activities: 0,
          transport: 0,
          contingency: 0,
          total: 1200,
          currency: "USD",
          per_person: 1200,
          per_day: 240,
        },
      },
    } as never;
    const repository = createRepository(vi.fn());
    repository.findForTrip = vi.fn().mockResolvedValue(itinerary);
    const service = new ItineraryService(repository, createCitiesService());

    await expect(
      service.getForTrip({ tripId: "trip-1", userId: "user-1" }),
    ).resolves.toEqual({ ok: true, value: itinerary });
  });

  it("does not expose a missing source itinerary", async () => {
    const repository = createRepository(vi.fn());
    repository.findForTrip = vi.fn().mockResolvedValue(null);
    const cities = createCitiesService();
    const service = new ItineraryService(repository, cities);

    await expect(
      service.getForTrip({ tripId: "trip-1", userId: "user-1" }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "not_found",
        statusCode: 404,
        message: "Saved itinerary not found",
      },
    });
  });
});

describe("ItineraryService.generate", () => {
  it("resolves flexible dates before generation and saves dates plus the selection explanation", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const repository = createRepository(vi.fn());
    repository.createComplete = vi.fn().mockResolvedValue("flexible-1");
    const weather = {
      forPlan: vi.fn().mockImplementation(async (plan) =>
        plan.days.map((day: { date: string; city_slug: string }) => ({
          ...day,
          status: "forecast",
          precipitation_mm:
            day.date >= "2090-02-10" && day.date <= "2090-02-12" ? 0 : 20,
          temperature_min: 20,
          temperature_max: 27,
        })),
      ),
    };
    try {
      await new ItineraryService(
        repository,
        createCitiesService(),
        weather as never,
      ).generate({
        userId: "user-1",
        dto: {
          cities: ["hanoi"],
          city_names: ["Hanoi"],
          flexible_month: "2090-02",
          num_days: 3,
          currency: "USD",
          trip_style: "mixed",
          num_travelers: 2,
        },
      });
      expect(repository.createComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          request: expect.objectContaining({
            flexible_month: "2090-02",
            start_date: "2090-02-10",
            end_date: "2090-02-12",
            num_days: 3,
          }),
          result: expect.objectContaining({
            days: expect.arrayContaining([
              expect.objectContaining({ date: "2090-02-10" }),
              expect.objectContaining({ date: "2090-02-12" }),
            ]),
            seasonal_notes: expect.objectContaining({
              warnings: expect.arrayContaining([
                expect.stringContaining("Forecasts may change"),
              ]),
            }),
          }),
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reuses an exact saved result without constructing an AI provider", async () => {
    vi.stubEnv("AI_PROVIDER", "invalid-provider");
    const repository = createRepository(vi.fn());
    const stored = { title: "Saved Hanoi trip", days: [{ city: "Hanoi" }] } as never;
    repository.findReusable = vi.fn().mockResolvedValue({ id: "saved-1", result: stored });
    try {
      const response = await new ItineraryService(repository, createCitiesService()).generate({
        userId: "user-1",
        dto: {
          cities: ["hanoi"], city_names: ["Hanoi"], num_days: 7,
          budget: 500, currency: "USD", trip_style: "budget", num_travelers: 3,
        },
      });
      expect(response).toMatchObject({ status: "cached", cache_hit: true, itinerary_id: "saved-1", result: stored });
      expect(repository.createComplete).not.toHaveBeenCalled();
      expect(repository.findReusable).toHaveBeenCalledWith({ userId: "user-1", cacheKey: expect.stringMatching(/^[0-9a-f]{64}$/) });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("honors force_refresh and calls AI for a new version", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const repository = createRepository(vi.fn());
    repository.createComplete = vi.fn().mockResolvedValue("fresh-1");
    repository.findReusable = vi.fn().mockResolvedValue({ id: "saved-1", result: { days: [{}] } });
    try {
      const response = await new ItineraryService(repository, createCitiesService()).generate({
        userId: "user-1",
        dto: {
          cities: ["hanoi"], city_names: ["Hanoi"], num_days: 1,
          budget: 500, currency: "USD", trip_style: "budget", num_travelers: 3,
          force_refresh: true,
        },
      });
      expect(response).toMatchObject({ status: "cached", cache_hit: false, itinerary_id: "fresh-1" });
      expect(repository.findReusable).not.toHaveBeenCalled();
      expect(repository.createComplete).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("generates and saves an itinerary when a destination is not in the city catalog", async () => {
    vi.stubEnv("AI_PROVIDER", "mock");
    const repository = createRepository(vi.fn());
    repository.createComplete = vi.fn().mockResolvedValue("itinerary-1");
    const cities = createCitiesService();
    const service = new ItineraryService(repository, cities);

    try {
      const response = await service.generate({
        userId: "user-1",
        dto: {
          cities: ["unknown-place"],
          city_names: ["Unknown Place"],
          num_days: 3,
          budget: 1000,
          currency: "USD",
          trip_style: "adventure",
          num_travelers: 2,
        },
      });

      expect(response).toMatchObject({
        status: "cached",
        itinerary_id: "itinerary-1",
      });
      expect(repository.createComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          request: expect.objectContaining({
            cities: ["unknown-place"],
            currency: "USD",
          }),
          catalogCities: [{ slug: "unknown-place", name: "Unknown Place" }],
          result: expect.objectContaining({
            days: expect.arrayContaining([
              expect.objectContaining({ city: "Unknown Place" }),
            ]),
          }),
        }),
      );
      expect(cities.remember).toHaveBeenCalledWith("Unknown Place", "unknown-place");
      expect(cities.findForPlanning).toHaveBeenCalledWith("unknown-place");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("AI failure persistence", () => {
  it.each([false, true])(
    "returns the original AI failure when diagnostic persistence fails=%s",
    async (databaseFails) => {
      vi.stubEnv("AI_PROVIDER", "invalid-provider");
      const repository = createRepository(vi.fn());
      if (databaseFails)
        repository.recordFailure = vi
          .fn()
          .mockRejectedValue(new Error("database down"));
      try {
        const response = await new ItineraryService(
          repository,
          createCitiesService(),
        ).generate({
          userId: "user-1",
          dto: {
            cities: ["tokyo"],
            num_days: 2,
            currency: "USD",
            trip_style: "mid_range",
            num_travelers: 1,
          },
        });
        expect(response).toMatchObject({
          status: "unsupported",
          code: "AI_UNAVAILABLE",
        });
        expect(repository.recordFailure).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: "user-1",
            provider: "invalid-provider",
            code: "AI_UNAVAILABLE",
            message: expect.any(String),
          }),
        );
        expect(repository.createComplete).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );
});
