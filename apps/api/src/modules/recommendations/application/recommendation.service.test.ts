import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listPlaceRecommendations,
  listTransportPriceRecommendations,
} from "../../../db/recommendation-store.js";
import { RecommendationService } from "./recommendation.service";

vi.mock("../../../db/recommendation-store.js", () => ({
  listPlaceRecommendations: vi.fn(),
  listTransportPriceRecommendations: vi.fn(),
}));

const service = new RecommendationService();

describe("RecommendationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates place recommendation filters to the repository", async () => {
    vi.mocked(listPlaceRecommendations).mockResolvedValue([]);

    await service.places({ city_slug: "da-nang", type: "cafe", limit: 5 });

    expect(listPlaceRecommendations).toHaveBeenCalledWith({ city_slug: "da-nang", type: "cafe", limit: 5 });
  });

  it("delegates transport price recommendation filters to the repository", async () => {
    vi.mocked(listTransportPriceRecommendations).mockResolvedValue([]);

    await service.transportPrices({ mode: "train", from: "SGN", to: "DAD", month: 8, limit: 3 });

    expect(listTransportPriceRecommendations).toHaveBeenCalledWith({
      mode: "train",
      from: "SGN",
      to: "DAD",
      month: 8,
      limit: 3,
    });
  });
});
