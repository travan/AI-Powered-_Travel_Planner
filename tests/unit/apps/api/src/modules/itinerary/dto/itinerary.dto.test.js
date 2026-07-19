import { beforeEach, describe, expect, it, vi } from "vitest";
const itinerary_dto_1 = await import("../../../../../../../../apps/api/dist/modules/itinerary/dto/itinerary.dto");
describe("itinerary DTO validation", () => {
    it("validates flexible route identifiers used by cached and queued flows", () => {
        expect(itinerary_dto_1.itineraryIdParamsDto.safeParse({ id: "cached-trip-1" }).success).toBe(true);
        expect(itinerary_dto_1.itineraryJobParamsDto.safeParse({ jobId: "queued-job-1" }).success).toBe(true);
        expect(itinerary_dto_1.itineraryShareTokenParamsDto.safeParse({ shareToken: "demo-share-da-nang-hoi-an" }).success).toBe(true);
        expect(itinerary_dto_1.itineraryIdParamsDto.safeParse({ id: "" }).success).toBe(false);
    });
    it("normalizes generate payload fields and trip style aliases", () => {
        const parsed = itinerary_dto_1.generateItineraryDto.parse({
            cities: [" da-nang ", "hoi-an"],
            num_days: "4",
            budget: "12000000",
            currency: "vnd",
            trip_style: "family",
            locale: " vi ",
            num_travelers: "3",
            prompt_text: "  đi biển và ăn địa phương  ",
        });
        expect(parsed).toMatchObject({
            cities: ["da-nang", "hoi-an"],
            num_days: 4,
            budget: 12000000,
            currency: "VND",
            locale: "vi",
            num_travelers: 3,
            prompt_text: "đi biển và ăn địa phương",
        });
        expect(itinerary_dto_1.normalizeTripStyle(parsed.trip_style)).toBe("relax");
    });
    it("requires either a date window or num_days", () => {
        expect(itinerary_dto_1.generateItineraryDto.safeParse({ cities: ["da-nang"] }).success).toBe(false);
    });
    it("defaults share toggles to public", () => {
        expect(itinerary_dto_1.shareItineraryDto.parse({})).toEqual({ is_public: true });
        expect(itinerary_dto_1.shareItineraryDto.parse({ is_public: false })).toEqual({ is_public: false });
    });
});
