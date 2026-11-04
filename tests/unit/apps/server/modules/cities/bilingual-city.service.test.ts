import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "../../../../../../apps/server/node_modules/@nestjs/common/index.js";
import { CitiesService } from "../../../../../../apps/server/src/modules/cities/application/cities.service";
import { normalizeCityInput } from "../../../../../../apps/server/src/modules/cities/infrastructure/postgres-city.repository";
const city = {
  slug: "beijing",
  name: { en: "Beijing", vi: "Bắc Kinh" },
  country: "CN",
  timezone: "Asia/Shanghai",
  currency: "CNY",
  lat: 39.9,
  lon: 116.4,
  popular: false,
};
describe("automatic bilingual city identity", () => {
  it("folds Vietnamese accents, đ, spaces and hyphens without changing identity", () => {
    expect(normalizeCityInput("ĐÀ NẴNG")).toBe(normalizeCityInput("da-nang"));
    expect(normalizeCityInput("Bắc Kinh")).toBe("backinh");
  });
  it("uses a selected stable ID before a translated display name", async () => {
    const repository = { remember: vi.fn().mockResolvedValue(city) };
    const lookup = { cityCandidates: vi.fn() };
    const result = await new CitiesService(
      repository as any,
      lookup as any,
    ).remember("Bắc Kinh", "beijing");
    expect(result.slug).toBe("beijing");
    expect(repository.remember).toHaveBeenCalledWith("beijing");
    expect(lookup.cityCandidates).not.toHaveBeenCalled();
  });
  it("automatically resolves one provider city and persists its bilingual alias", async () => {
    const repository = {
      remember: vi
        .fn()
        .mockRejectedValue(
          new BadRequestException({ code: "CITY_UNRESOLVED" }),
        ),
    };
    const lookup = {
      cityCandidates: vi
        .fn()
        .mockResolvedValue({ candidates: [{ source_id: "relation/1" }] }),
      rememberResolved: vi.fn().mockResolvedValue(city),
    };
    const result = await new CitiesService(
      repository as any,
      lookup as any,
    ).remember("Bắc Kinh");
    expect(result.name.en).toBe("Beijing");
    expect(lookup.rememberResolved).toHaveBeenCalledWith(
      "Bắc Kinh",
      "relation/1",
    );
  });
  it("does not guess between two cities sharing a name", async () => {
    const repository = {
      remember: vi
        .fn()
        .mockRejectedValue(
          new BadRequestException({ code: "CITY_UNRESOLVED" }),
        ),
    };
    const lookup = {
      cityCandidates: vi
        .fn()
        .mockResolvedValue({
          candidates: [{ source_id: "a" }, { source_id: "b" }],
        }),
      rememberResolved: vi.fn(),
    };
    await expect(
      new CitiesService(repository as any, lookup as any).remember(
        "Springfield",
      ),
    ).rejects.toMatchObject({ response: { code: "CITY_AMBIGUOUS" } });
    expect(lookup.rememberResolved).not.toHaveBeenCalled();
  });
});
