import { describe, expect, it } from "vitest";
import { buildPromptCluster, slugify } from "./prompt-clusters";

describe("prompt clusters", () => {
  it("slugifies Vietnamese destination names for stable reuse", () => {
    expect(slugify("Đà Nẵng")).toBe("da-nang");
    expect(slugify("Thành phố Hồ Chí Minh")).toBe("thanh-pho-ho-chi-minh");
  });

  it("returns the same cluster key for equivalent structured prompts", () => {
    const first = buildPromptCluster({
      cities: ["da-nang", "hoi-an"],
      cityNames: ["Đà Nẵng", "Hội An"],
      input: {
        num_days: 5,
        budget: 6_200_000,
        currency: "VND",
        trip_style: "culture",
        locale: "vi",
        num_travelers: 2,
      },
    });

    const second = buildPromptCluster({
      cities: ["da-nang", "hoi-an"],
      cityNames: ["Đà Nẵng", "Hội An"],
      input: {
        num_days: 5,
        budget: 6_400_000,
        currency: "VND",
        trip_style: "culture",
        locale: "vi",
        num_travelers: 2,
      },
    });

    expect(first.cluster_key).toBe(second.cluster_key);
    expect(first.duration_bucket).toBe("standard-week");
    expect(first.budget_bucket).toBe("budget-vnd-5m-10m");
    expect(first.traveler_bucket).toBe("couple");
    expect(first.intent_tags).toEqual(expect.arrayContaining(["beach", "culture", "heritage"]));
  });
});
