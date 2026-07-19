import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const itineraryStoreMock = {
    itineraryStore: {
        findById: vi.fn(),
        findByJobId: vi.fn(),
        findSharedByToken: vi.fn(),
        saveTrip: vi.fn(),
        setPublic: vi.fn(),
    },
};
const redisMock = {
    TTL: { ITINERARY_RESULT: 3_600 },
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
};
const itineraryStorePath = require.resolve("../../../../../../../../apps/api/dist/db/itinerary-store.js");
require.cache[itineraryStorePath] = {
    id: itineraryStorePath,
    filename: itineraryStorePath,
    loaded: true,
    exports: itineraryStoreMock,
};
const redisPath = require.resolve("../../../../../../../../apps/api/dist/db/redis.js");
require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: redisMock,
};

const itinerary_store_js_1 = itineraryStoreMock;
const redis_js_1 = redisMock;
const itinerary_service_1 = await import("../../../../../../../../apps/api/dist/modules/itinerary/application/itinerary.service.js");
const itinerary = {
    id: "trip-1",
    title: "Da Nang Trip",
    currency: "VND",
    days: [],
};
describe("ItineraryService", () => {
    const service = new itinerary_service_1.ItineraryService();
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(redis_js_1.cacheGet).mockResolvedValue(null);
    });
    it("normalizes stored itinerary rows into API output", () => {
        expect(itinerary_service_1.normalizeItineraryOutput({ id: "trip-1", result: itinerary })).toEqual({
            itineraries: [itinerary],
        });
    });
    it("fetches itinerary by id and caches the store result", async () => {
        vi.mocked(itinerary_store_js_1.itineraryStore.findById).mockResolvedValue({ id: "trip-1", result: itinerary });
        const result = await service.getById("trip-1");
        expect(result.ok).toBe(true);
        expect(redis_js_1.cacheSet).toHaveBeenCalled();
    });
    it("maps malformed itinerary rows to internal_error", async () => {
        vi.mocked(itinerary_store_js_1.itineraryStore.findById).mockResolvedValue({ id: "trip-1", result: { bad: true } });
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
        vi.mocked(itinerary_store_js_1.itineraryStore.setPublic).mockResolvedValue(null);
        await expect(service.share({
            itineraryId: "trip-1",
            userId: "user-1",
            dto: { is_public: true },
        })).resolves.toEqual({
            ok: false,
            error: { code: "forbidden", statusCode: 403, message: "Not your itinerary" },
        });
    });
});
