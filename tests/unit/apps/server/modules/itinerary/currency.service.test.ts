import { afterEach, describe, expect, it, vi } from "vitest";
import { CurrencyService } from "../../../../../../apps/server/src/modules/itinerary/enrichment/currency.service";
const body = () => ({
  result: "success",
  base_code: "USD",
  time_last_update_unix: Math.floor(Date.now() / 1000) - 3600,
  time_next_update_unix: Math.floor(Date.now() / 1000) + 82800,
  rates: { USD: 1, VND: 25000, EUR: 0.9 },
});
afterEach(() => vi.unstubAllGlobals());
describe("indicative currency quotes", () => {
  it("gets one upstream table and caches forward/reverse cross-rates", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(body())));
    vi.stubGlobal("fetch", fetch);
    const service = new CurrencyService();
    const [forward, reverse] = await Promise.all([
      service.quote("USD", "VND"),
      service.quote("VND", "USD"),
    ]);
    expect(forward).toMatchObject({
      from: "USD",
      to: "VND",
      rate: 25000,
      source_url: "https://www.exchangerate-api.com",
    });
    expect(reverse.rate).toBe(1 / 25000);
    expect((await service.quote("EUR", "VND")).rate).toBe(25000 / 0.9);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("rejects stale or missing rates without substituting a made-up value", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              ...body(),
              time_last_update_unix: Math.floor(Date.now() / 1000) - 3 * 86400,
            }),
          ),
        ),
    );
    await expect(
      new CurrencyService().quote("USD", "VND"),
    ).rejects.toMatchObject({
      response: { code: "CURRENCY_RATE_UNAVAILABLE" },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...body(), rates: { USD: 1 } })),
        ),
    );
    await expect(
      new CurrencyService().quote("USD", "VND"),
    ).rejects.toMatchObject({
      response: { code: "CURRENCY_RATE_UNAVAILABLE" },
    });
  });
  it("allows retry after an upstream failure", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify(body())));
    vi.stubGlobal("fetch", fetch);
    const service = new CurrencyService();
    await expect(service.quote("USD", "VND")).rejects.toThrow();
    expect((await service.quote("USD", "VND")).rate).toBe(25000);
  });
});
