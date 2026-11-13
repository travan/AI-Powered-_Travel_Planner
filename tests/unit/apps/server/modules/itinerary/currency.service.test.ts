import { afterEach, describe, expect, it, vi } from "vitest";
import { CurrencyService } from "../../../../../../apps/server/src/modules/itinerary/enrichment/currency.service";
const body = () => ({
  result: "success",
  base_code: "USD",
  time_last_update_unix: Math.floor(Date.now() / 1000) - 3600,
  time_next_update_unix: Math.floor(Date.now() / 1000) + 82800,
  rates: { USD: 1, VND: 25000, EUR: 0.9 },
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe("indicative currency quotes", () => {
  it("gets one upstream table and caches forward/reverse cross-rates", async () => {
    vi.stubEnv("RUNTIME_TARGET", "node");
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
  it("rechecks an overdue provider table after at most one minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T00:30:00Z"));
    const overdue = {
      ...body(),
      time_next_update_unix: Date.now() / 1000 - 1,
    };
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => new Response(JSON.stringify(overdue)))
      .mockImplementation(() => new Response(JSON.stringify(body())));
    vi.stubGlobal("fetch", fetch);
    const service = new CurrencyService();
    expect(await service.quote("USD", "VND")).toMatchObject({
      rate: 25000,
      expires_at: "2026-11-11T00:31:00.000Z",
    });
    vi.advanceTimersByTime(59_000);
    await service.quote("USD", "VND");
    expect(fetch).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1_000);
    await service.quote("USD", "VND");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("never serves a table at or beyond its 48-hour age limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T00:30:00Z"));
    const old = {
      ...body(),
      time_last_update_unix: Date.now() / 1000 - 48 * 3600 + 10,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Response(JSON.stringify(old))),
    );
    const service = new CurrencyService();
    expect((await service.quote("USD", "VND")).expires_at).toBe(
      "2026-11-11T00:30:10.000Z",
    );
    vi.advanceTimersByTime(10_000);
    await expect(service.quote("USD", "VND")).rejects.toMatchObject({
      response: { code: "CURRENCY_RATE_UNAVAILABLE" },
    });
  });
  it("runs independent Worker fetches on cache miss and reuses parsed rates", async () => {
    vi.stubEnv("RUNTIME_TARGET", "cloudflare");
    const fetch = vi.fn(async () => new Response(JSON.stringify(body())));
    vi.stubGlobal("fetch", fetch);
    const service = new CurrencyService();
    const [forward, reverse] = await Promise.all([
      service.quote("USD", "VND"),
      service.quote("VND", "USD"),
    ]);
    expect(forward.rate).toBe(25000);
    expect(reverse.rate).toBe(1 / 25000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await service.quote("EUR", "VND");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("rejects stale or missing rates without substituting a made-up value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
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
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(body())));
    vi.stubGlobal("fetch", fetch);
    const service = new CurrencyService();
    await expect(service.quote("USD", "VND")).rejects.toThrow();
    expect((await service.quote("USD", "VND")).rate).toBe(25000);
  });
});
