import { afterEach, describe, expect, it, vi } from "vitest";
import { WeatherService } from "../../../../../../apps/server/src/modules/itinerary/enrichment/weather.service";
import type { Itinerary } from "../../../../../../packages/types/src";
function fixture(date = "2026-11-04") {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  const service = new WeatherService({ query });
  const plan = {
    city_catalog: {
      "da-nang": {
        name: { en: "Da Nang", vi: "Đà Nẵng" },
        country: "VN",
        timezone: "Asia/Ho_Chi_Minh",
      },
    },
    days: [{ city_slug: "da-nang", date }],
  } as unknown as Itinerary;
  return {
    query,
    service,
    plan,
    coordinates: new Map([["da-nang", { lat: 16.05, lon: 108.2 }]]),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("WeatherService", () => {
  it("groups local dates and sums non-overlapping precipitation windows", async () => {
    vi.stubEnv("WEATHER_CONTACT_URL", "https://example.com/contact");
    const f = fixture();
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          properties: {
            meta: { updated_at: "2026-11-03T00:00:00Z" },
            timeseries: [
              {
                time: "2026-11-03T18:00:00Z",
                data: {
                  instant: { details: { air_temperature: 24 } },
                  next_1_hours: {
                    details: { precipitation_amount: 1 },
                    summary: { symbol_code: "rain" },
                  },
                  next_6_hours: { details: { precipitation_amount: 10 } },
                },
              },
              {
                time: "2026-11-03T19:00:00Z",
                data: {
                  instant: { details: { air_temperature: 26 } },
                  next_1_hours: { details: { precipitation_amount: 2 } },
                },
              },
            ],
          },
        }),
        { headers: { Expires: "Wed, 04 Nov 2026 00:00:00 GMT" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await f.service.forPlan(f.plan, f.coordinates);
    expect(result[0]).toMatchObject({
      date: "2026-11-04",
      status: "forecast",
      partial: true,
      temperature_min: 24,
      temperature_max: 26,
      precipitation_mm: 3,
    });
    expect(fetch.mock.calls[0][1].headers["User-Agent"]).toContain(
      "example.com",
    );
  });
  it("uses cached weather without another upstream request", async () => {
    const f = fixture();
    f.query.mockResolvedValue({
      rows: [
        { body: { properties: { timeseries: [] } }, expires_at: "2099-01-01" },
      ],
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await f.service.forPlan(f.plan, f.coordinates);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns missing state on failure, never a fabricated zero temperature", async () => {
    vi.stubEnv("WEATHER_CONTACT_URL", "https://example.com");
    const f = fixture();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const result = await f.service.forPlan(f.plan, f.coordinates);
    expect(result[0]).toMatchObject({ status: "unavailable" });
    expect(result[0]?.temperature_min).toBeUndefined();
  });
  it("labels seasonal normals separately and retains their reference period", async () => {
    vi.stubEnv("WEATHER_CONTACT_URL", "https://example.com");
    const f = fixture("2027-06-01");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              properties: {
                timeseries: [{ time: "2026-11-05T00:00:00Z", data: {} }],
              },
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              properties: {
                parameter: {
                  T2M_MIN: { JUN: 24 },
                  T2M_MAX: { JUN: 33 },
                  PRECTOTCORR: { JUN: 5 },
                },
              },
            }),
          ),
        ),
    );
    const result = await f.service.forPlan(f.plan, f.coordinates);
    expect(result[0]).toMatchObject({
      status: "climate",
      source: "NASA POWER",
      climate_period: "2001–2020",
      temperature_max: 33,
    });
  });
});
