import { describe, expect, it, vi } from "vitest";
import { ItineraryService } from "../../../../../../apps/server/src/modules/itinerary/application/itinerary.service";
import type { ItineraryRepository } from "../../../../../../apps/server/src/modules/itinerary/domain/itinerary.repository";
import type { CitiesService } from "../../../../../../apps/server/src/modules/cities/application/cities.service";

function createRepository(
  saveAsTrip: ItineraryRepository["saveAsTrip"]
): ItineraryRepository {
  return {
    findVisible: vi.fn(),
    findForTrip: vi.fn(),
    createComplete: vi.fn(),
    saveAsTrip,
  };
}

describe("ItineraryService.save", () => {
  it("returns the workspace trip id after saving", async () => {
    const repository = createRepository(
      vi.fn().mockResolvedValue({ tripId: "trip-1" })
    );
    const service = new ItineraryService(repository);

    await expect(
      service.save({ itineraryId: "itinerary-1", userId: "user-1" })
    ).resolves.toEqual({
      ok: true,
      value: { saved: true, trip_id: "trip-1" },
    });
  });

  it("does not expose another user's itinerary", async () => {
    const repository = createRepository(vi.fn().mockResolvedValue(null));
    const service = new ItineraryService(repository);

    await expect(
      service.save({ itineraryId: "itinerary-1", userId: "user-2" })
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
        seasonal_notes: { travel_month: "April", daylight_hours: "12h", sunrise_time: "06:00", sunset_time: "18:00", weather_note: "Mild", highlights: [], warnings: [] },
        transport_summary: [],
        days: [],
        hotels: [],
        restaurants: [],
        suggestions: [],
        budget_breakdown: { accommodation: 0, food: 0, activities: 0, transport: 0, contingency: 0, total: 1200, currency: "USD", per_person: 1200, per_day: 240 },
      },
    } as never;
    const repository = createRepository(vi.fn());
    repository.findForTrip = vi.fn().mockResolvedValue(itinerary);
    const service = new ItineraryService(repository);

    await expect(
      service.getForTrip({ tripId: "trip-1", userId: "user-1" })
    ).resolves.toEqual({ ok: true, value: itinerary });
  });

  it("does not expose a missing source itinerary", async () => {
    const repository = createRepository(vi.fn());
    repository.findForTrip = vi.fn().mockResolvedValue(null);
    const service = new ItineraryService(repository);

    await expect(
      service.getForTrip({ tripId: "trip-1", userId: "user-1" })
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
  it("returns a supported fallback when a destination is not in the city catalog", async () => {
    const repository = createRepository(vi.fn());
    const cities = {
      getDetail: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "not_found", statusCode: 404, message: "City not found" },
      }),
    } as unknown as CitiesService;
    const service = new ItineraryService(repository, cities);

    await expect(
      service.generate({
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
      }),
    ).resolves.toEqual({
      status: "unsupported",
      code: "UNSUPPORTED_DESTINATION",
      message: "We don't have enough destination data for Unknown Place yet. Try another destination or search by a nearby supported city.",
      unsupported_cities: ["Unknown Place"],
    });
    expect(repository.createComplete).not.toHaveBeenCalled();
  });
});
