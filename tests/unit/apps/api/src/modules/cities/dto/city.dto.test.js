import { beforeEach, describe, expect, it, vi } from "vitest";
const city_dto_1 = await import("../../../../../../../../apps/api/dist/modules/cities/dto/city.dto");
describe("city DTO validation", () => {
    it("trims city search queries and defaults missing q", () => {
        expect(city_dto_1.citySearchQueryDto.parse({ q: "  da nang  " })).toEqual({ q: "da nang" });
        expect(city_dto_1.citySearchQueryDto.parse({})).toEqual({ q: "" });
    });
    it("validates city slugs", () => {
        expect(city_dto_1.citySlugParamsDto.safeParse({ slug: "da-nang" }).success).toBe(true);
        expect(city_dto_1.citySlugParamsDto.safeParse({ slug: "../secret" }).success).toBe(false);
    });
});
