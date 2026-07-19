import { describe, expect, it } from "vitest";
import {
  generateItineraryDto,
  itineraryIdParamsDto,
  itineraryJobParamsDto,
  itineraryShareTokenParamsDto,
  normalizeTripStyle,
  shareItineraryDto,
} from "./itinerary.dto";

describe("itinerary DTO validation", () => {
  it("validates flexible route identifiers used by cached and queued flows", () => {
    expect(itineraryIdParamsDto.safeParse({ id: "cached-trip-1" }).success).toBe(true);
    expect(itineraryJobParamsDto.safeParse({ jobId: "queued-job-1" }).success).toBe(true);
    expect(itineraryShareTokenParamsDto.safeParse({ shareToken: "demo-share-da-nang-hoi-an" }).success).toBe(true);
    expect(itineraryIdParamsDto.safeParse({ id: "" }).success).toBe(false);
  });

  it("normalizes generate payload fields and trip style aliases", () => {
    const parsed = generateItineraryDto.parse({
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
    expect(normalizeTripStyle(parsed.trip_style)).toBe("relax");
  });

  it("requires either a date window or num_days", () => {
    expect(generateItineraryDto.safeParse({ cities: ["da-nang"] }).success).toBe(false);
  });

  it("defaults share toggles to public", () => {
    expect(shareItineraryDto.parse({})).toEqual({ is_public: true });
    expect(shareItineraryDto.parse({ is_public: false })).toEqual({ is_public: false });
  });
});
