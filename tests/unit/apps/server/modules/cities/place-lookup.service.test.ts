import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceLookupService } from "../../../../../../apps/server/src/modules/cities/application/place-lookup.service";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const candidate = {
  osm_type: "relation",
  osm_id: 123,
  display_name: "Taipei, Taiwan",
  lat: "25.03",
  lon: "121.56",
  addresstype: "city",
  address: { country_code: "tw" },
  namedetails: { "name:en": "Taipei", "name:vi": "Đài Bắc" },
};
describe("explicit location lookup", () => {
  it("serves cached candidates without a network request", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ body: [candidate] }] });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await new PlaceLookupService({ query }).cityCandidates(
      "Đài Bắc",
    );
    expect(result.candidates[0]).toMatchObject({
      name: "Taipei",
      country: "TW",
      source_id: "relation/123",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("enforces the shared rate lease before calling Nominatim", async () => {
    vi.stubEnv("WEATHER_CONTACT_URL", "https://example.com");
    const query = vi.fn().mockResolvedValue({ rows: [] }),
      fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      new PlaceLookupService({ query }).cityCandidates("Taipei"),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses client-invented coordinates or an unoffered source identity", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    await expect(
      new PlaceLookupService({ query }).rememberResolved(
        "Taipei",
        "relation/999",
      ),
    ).rejects.toMatchObject({ response: { code: "CITY_UNRESOLVED" } });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("persists English canonical names and Vietnamese labels using the selected provider result", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ body: [candidate] }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            slug: "taipei-tw-relation-123",
            name: { en: "Taipei", vi: "Đài Bắc" },
          },
        ],
      });
    await new PlaceLookupService({ query }).rememberResolved(
      "Đài Bắc",
      "relation/123",
    );
    expect(query.mock.calls[3]?.[1]).toEqual(
      expect.arrayContaining([
        { en: "Taipei", vi: "Đài Bắc" },
        "Asia/Taipei",
        25.03,
        121.56,
      ]),
    );
  });
});
