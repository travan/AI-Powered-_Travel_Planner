import { beforeEach, describe, expect, it, vi } from "vitest";
const prompt_clusters_1 = await import("../../../../../../apps/api/dist/lib/prompt-clusters");
describe("prompt clusters", () => {
    it("slugifies Vietnamese destination names for stable reuse", () => {
        expect(prompt_clusters_1.slugify("Đà Nẵng")).toBe("da-nang");
        expect(prompt_clusters_1.slugify("Thành phố Hồ Chí Minh")).toBe("thanh-pho-ho-chi-minh");
    });
    it("returns the same cluster key for equivalent structured prompts", () => {
        const first = prompt_clusters_1.buildPromptCluster({
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
        const second = prompt_clusters_1.buildPromptCluster({
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
