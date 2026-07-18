import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cityStoreMock = {
    cityStore: {
        findBySlug: vi.fn(),
        popular: vi.fn(),
        search: vi.fn(),
    },
};
const redisMock = {
    TTL: { CITY_METADATA: 86_400 },
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
};
const cityStorePath = require.resolve("../../../../../../../../apps/api/dist/db/city-store.js");
require.cache[cityStorePath] = {
    id: cityStorePath,
    filename: cityStorePath,
    loaded: true,
    exports: cityStoreMock,
};
const redisPath = require.resolve("../../../../../../../../apps/api/dist/db/redis.js");
require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: redisMock,
};

const city_store_js_1 = cityStoreMock;
const redis_js_1 = redisMock;
const city_service_1 = await import("../../../../../../../../apps/api/dist/modules/cities/application/city.service.js");
const city = {
    slug: "da-nang",
    name: { en: "Da Nang", vi: "Đà Nẵng" },
    country: "VN",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
    lat: 16.047,
    lon: 108.206,
    popular: true,
    scraper_sources: {
        places: "internal",
        tickets: [],
        transport: [],
    },
};
describe("CityService", () => {
    const service = new city_service_1.CityService();
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(redis_js_1.cacheGet).mockResolvedValue(null);
    });
    it("returns an empty list for very short search queries", async () => {
        await expect(service.search("d")).resolves.toEqual([]);
        expect(city_store_js_1.cityStore.search).not.toHaveBeenCalled();
    });
    it("searches and caches city results", async () => {
        vi.mocked(city_store_js_1.cityStore.search).mockResolvedValue([city]);
        await expect(service.search("da nang")).resolves.toEqual([city]);
        expect(redis_js_1.cacheSet).toHaveBeenCalled();
    });
    it("maps missing city detail to not_found", async () => {
        vi.mocked(city_store_js_1.cityStore.findBySlug).mockResolvedValue(null);
        await expect(service.getDetail("missing")).resolves.toEqual({
            ok: false,
            error: { code: "not_found", statusCode: 404, message: "City not found" },
        });
    });
});
