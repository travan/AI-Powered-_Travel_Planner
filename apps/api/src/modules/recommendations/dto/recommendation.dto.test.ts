import { describe, expect, it } from "vitest";
import {
  placeRecommendationQueryDto,
  transportRecommendationQueryDto,
} from "./recommendation.dto";

describe("recommendation DTO validation", () => {
  it("coerces safe place recommendation filters", () => {
    expect(placeRecommendationQueryDto.parse({ city_slug: " da-nang ", type: "cafe", limit: "5" })).toEqual({
      city_slug: "da-nang",
      type: "cafe",
      limit: 5,
    });
  });

  it("bounds recommendation limits", () => {
    expect(placeRecommendationQueryDto.safeParse({ limit: 100 }).success).toBe(false);
    expect(transportRecommendationQueryDto.safeParse({ month: 13 }).success).toBe(false);
    expect(transportRecommendationQueryDto.safeParse({ mode: "spaceship" }).success).toBe(false);
  });

  it("coerces safe transport recommendation filters", () => {
    expect(transportRecommendationQueryDto.parse({ mode: "ferry", from: " sgN ", to: " pqc ", limit: "3" })).toEqual({
      mode: "ferry",
      from: "sgN",
      to: "pqc",
      limit: 3,
    });
  });
});
