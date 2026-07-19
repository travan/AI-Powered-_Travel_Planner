import { beforeEach, describe, expect, it, vi } from "vitest";
import { cityStore } from "../../../db/city-store.js";
import { cacheGet, cacheSet } from "../../../db/redis.js";
import { CityService } from "./city.service";

vi.mock("../../../db/city-store.js", () => ({
  cityStore: {
    findBySlug: vi.fn(),
    popular: vi.fn(),
    search: vi.fn(),
  },
}));

vi.mock("../../../db/redis.js", () => ({
  TTL: { CITY_METADATA: 86_400 },
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

const city = {
  slug: "da-nang",
  name: { en: "Da Nang", vi: "Đà Nẵng" },
  country: "VN",
  timezone: "Asia/Ho_Chi_Minh",
  currency: "VND",
  lat: 16.047,
  lon: 108.206,
  popular: true,
  scraper_sources: {
    places: "internal",
    tickets: [],
    transport: [],
  },
};

describe("CityService", () => {
  const service = new CityService();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cacheGet).mockResolvedValue(null);
  });

  it("returns an empty list for very short search queries", async () => {
    await expect(service.search("d")).resolves.toEqual([]);
    expect(cityStore.search).not.toHaveBeenCalled();
  });

  it("searches and caches city results", async () => {
    vi.mocked(cityStore.search).mockResolvedValue([city]);

    await expect(service.search("da nang")).resolves.toEqual([city]);
    expect(cacheSet).toHaveBeenCalled();
  });

  it("maps missing city detail to not_found", async () => {
    vi.mocked(cityStore.findBySlug).mockResolvedValue(null);

    await expect(service.getDetail("missing")).resolves.toEqual({
      ok: false,
      error: { code: "not_found", statusCode: 404, message: "City not found" },
    });
  });
});
