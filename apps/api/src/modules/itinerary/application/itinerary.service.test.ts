import { beforeEach, describe, expect, it, vi } from "vitest";
import { itineraryStore } from "../../../db/itinerary-store.js";
import { cacheGet, cacheSet } from "../../../db/redis.js";
import { ItineraryService, normalizeItineraryOutput } from "./itinerary.service";

vi.mock("../../../db/itinerary-store.js", () => ({
  itineraryStore: {
    findById: vi.fn(),
    findByJobId: vi.fn(),
    findSharedByToken: vi.fn(),
    saveTrip: vi.fn(),
    setPublic: vi.fn(),
  },
}));

vi.mock("../../../db/redis.js", () => ({
  TTL: { ITINERARY_RESULT: 3_600 },
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

const itinerary = {
  id: "trip-1",
  title: "Da Nang Trip",
  currency: "VND",
  days: [],
};

describe("ItineraryService", () => {
  const service = new ItineraryService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cacheGet).mockResolvedValue(null);
  });

  it("normalizes stored itinerary rows into API output", () => {
    expect(normalizeItineraryOutput({ id: "trip-1", result: itinerary })).toEqual({
      itineraries: [itinerary],
    });
  });

  it("fetches itinerary by id and caches the store result", async () => {
    vi.mocked(itineraryStore.findById).mockResolvedValue({ id: "trip-1", result: itinerary });

    const result = await service.getById("trip-1");

    expect(result.ok).toBe(true);
    expect(cacheSet).toHaveBeenCalled();
  });

  it("maps malformed itinerary rows to internal_error", async () => {
    vi.mocked(itineraryStore.findById).mockResolvedValue({ id: "trip-1", result: { bad: true } });

    await expect(service.getById("trip-1")).resolves.toEqual({
      ok: false,
      error: {
        code: "internal_error",
        statusCode: 500,
        message: "Stored itinerary has an unexpected shape",
        apiCode: "invalid_itinerary_shape",
      },
    });
  });

  it("shares only owned itineraries", async () => {
    vi.mocked(itineraryStore.setPublic).mockResolvedValue(null);

    await expect(
      service.share({
        itineraryId: "trip-1",
        userId: "user-1",
        dto: { is_public: true },
      })
    ).resolves.toEqual({
      ok: false,
      error: { code: "forbidden", statusCode: 403, message: "Not your itinerary" },
    });
  });
});
