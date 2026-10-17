import { describe, expect, it } from "vitest";
import { createManualCity, slugifyCityName } from "../../../../../packages/types/src/planner";

describe("manual city names", () => {
  it("creates a reusable slug without spaces or punctuation", () => {
    expect(createManualCity("Taipei City")).toEqual({
      slug: "taipei-city",
      name: "Taipei City",
    });
  });

  it("keeps letters from non-Latin city names in the slug", () => {
    expect(slugifyCityName("東京")).toBe("東京");
  });
});
