import { beforeEach, describe, expect, it, vi } from "vitest";
const recommendation_dto_1 = await import("../../../../../../../../apps/api/dist/modules/recommendations/dto/recommendation.dto");
describe("recommendation DTO validation", () => {
    it("coerces safe place recommendation filters", () => {
        expect(recommendation_dto_1.placeRecommendationQueryDto.parse({ city_slug: " da-nang ", type: "cafe", limit: "5" })).toEqual({
            city_slug: "da-nang",
            type: "cafe",
            limit: 5,
        });
    });
    it("bounds recommendation limits", () => {
        expect(recommendation_dto_1.placeRecommendationQueryDto.safeParse({ limit: 100 }).success).toBe(false);
        expect(recommendation_dto_1.transportRecommendationQueryDto.safeParse({ month: 13 }).success).toBe(false);
        expect(recommendation_dto_1.transportRecommendationQueryDto.safeParse({ mode: "spaceship" }).success).toBe(false);
    });
    it("coerces safe transport recommendation filters", () => {
        expect(recommendation_dto_1.transportRecommendationQueryDto.parse({ mode: "ferry", from: " sgN ", to: " pqc ", limit: "3" })).toEqual({
            mode: "ferry",
            from: "sgN",
            to: "pqc",
            limit: 3,
        });
    });
});
