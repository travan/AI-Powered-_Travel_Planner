import { describe, expect, it } from "vitest";
import { citySearchQueryDto, citySlugParamsDto } from "./city.dto";

describe("city DTO validation", () => {
  it("trims city search queries and defaults missing q", () => {
    expect(citySearchQueryDto.parse({ q: "  da nang  " })).toEqual({ q: "da nang" });
    expect(citySearchQueryDto.parse({})).toEqual({ q: "" });
  });

  it("validates city slugs", () => {
    expect(citySlugParamsDto.safeParse({ slug: "da-nang" }).success).toBe(true);
    expect(citySlugParamsDto.safeParse({ slug: "../secret" }).success).toBe(false);
  });
});
