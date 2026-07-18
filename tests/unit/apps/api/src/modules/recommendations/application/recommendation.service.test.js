import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const recommendationStoreMock = {
    listPlaceRecommendations: vi.fn(),
    listTransportPriceRecommendations: vi.fn(),
};
const recommendationStorePath = require.resolve("../../../../../../../../apps/api/dist/db/recommendation-store.js");
require.cache[recommendationStorePath] = {
    id: recommendationStorePath,
    filename: recommendationStorePath,
    loaded: true,
    exports: recommendationStoreMock,
};

const recommendation_store_js_1 = recommendationStoreMock;
const recommendation_service_1 = await import("../../../../../../../../apps/api/dist/modules/recommendations/application/recommendation.service.js");
const service = new recommendation_service_1.RecommendationService();
describe("RecommendationService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it("delegates place recommendation filters to the repository", async () => {
        vi.mocked(recommendation_store_js_1.listPlaceRecommendations).mockResolvedValue([]);
        await service.places({ city_slug: "da-nang", type: "cafe", limit: 5 });
        expect(recommendation_store_js_1.listPlaceRecommendations).toHaveBeenCalledWith({ city_slug: "da-nang", type: "cafe", limit: 5 });
    });
    it("delegates transport price recommendation filters to the repository", async () => {
        vi.mocked(recommendation_store_js_1.listTransportPriceRecommendations).mockResolvedValue([]);
        await service.transportPrices({ mode: "train", from: "SGN", to: "DAD", month: 8, limit: 3 });
        expect(recommendation_store_js_1.listTransportPriceRecommendations).toHaveBeenCalledWith({
            mode: "train",
            from: "SGN",
            to: "DAD",
            month: 8,
            limit: 3,
        });
    });
});
