import { describe, expect, it, vi } from "vitest";
import { ItineraryService } from "../../../../../../apps/server/src/modules/itinerary/application/itinerary.service";
import type { ItineraryRepository } from "../../../../../../apps/server/src/modules/itinerary/domain/itinerary.repository";

function createRepository(
  saveAsTrip: ItineraryRepository["saveAsTrip"]
): ItineraryRepository {
  return {
    findVisible: vi.fn(),
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
