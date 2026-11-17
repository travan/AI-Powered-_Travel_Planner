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
  it("uses country-filtered OSM city results from Photon when Nominatim is unavailable", async () => {
    vi.stubEnv("WEATHER_CONTACT_URL", "https://example.test");
    const query = vi.fn(async (sql: string, _params?: unknown[]) => ({
      rows: sql.includes("external_service_limits") ? [{ name: "lease" }] : [],
    }));
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("DNS lookup failed"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            features: [
              {
                properties: {
                  osm_type: "R",
                  osm_id: 2939672,
                  osm_value: "state",
                  type: "city",
                  name: "Kuala Lumpur",
                  countrycode: "MY",
                  country: "Malaysia",
                },
                geometry: { type: "Point", coordinates: [101.695, 3.151] },
              },
              {
                properties: {
                  osm_type: "N",
                  osm_id: 222,
                  type: "city",
                  name: "Wrong country",
                  countrycode: "SG",
                },
                geometry: { type: "Point", coordinates: [103.8, 1.3] },
              },
              {
                properties: {
                  osm_type: "N",
                  osm_id: 333,
                  type: "city",
                  name: "Invalid coordinates",
                  countrycode: "MY",
                },
                geometry: { type: "Point", coordinates: [999, 999] },
              },
            ],
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const result = await new PlaceLookupService({ query }).cityCandidates(
      "Kuala Lumpur, MY",
    );
    expect(result.candidates).toEqual([
      expect.objectContaining({
        name: "Kuala Lumpur",
        country: "MY",
        source_id: "relation/2939672",
      }),
    ]);
    const url = new URL(fetch.mock.calls[1]![0]);
    expect(url.searchParams.get("q")).toBe("Kuala Lumpur, Malaysia");
    expect(url.searchParams.get("countrycode")).toBe("MY");
    expect(
      query.mock.calls.some(
        ([sql, params]) =>
          sql.includes("insert into travel_external_cache") &&
          JSON.parse((params as unknown[])[1] as string)[0].geocoder ===
            "photon",
      ),
    ).toBe(true);
  });
  it("does not fail over city lookup when the primary service explicitly rate limits", async () => {
    vi.stubEnv("WEATHER_CONTACT_URL", "https://example.test");
    const query = vi.fn(async (sql: string, _params?: unknown[]) => ({
      rows: sql.includes("external_service_limits") ? [{ name: "lease" }] : [],
    }));
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      new PlaceLookupService({ query }).cityCandidates("Taipei"),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetch).toHaveBeenCalledOnce();
  });
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
