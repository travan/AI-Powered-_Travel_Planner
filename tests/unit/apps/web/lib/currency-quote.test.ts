import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../../../../../apps/web/lib/api";

const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../../../../apps/web/lib/journey-api", () => ({
  journeyRequest: mock.request,
}));
import { getCurrencyQuote } from "../../../../../apps/web/lib/planner-currency";

const quote = () => ({
  from: "VND",
  to: "USD",
  rate: 1 / 25000,
  updated_at: new Date(Date.now() - 3600000).toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  source_url: "https://www.exchangerate-api.com",
});

beforeEach(() => {
  vi.useFakeTimers();
  mock.request.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("currency quote recovery", () => {
  it.each([
    ["VND", new ApiRequestError("unavailable", 503)],
    ["JPY", new TypeError("fetch failed")],
    ["CAD", new DOMException("timed out", "TimeoutError")],
  ])(
    "automatically recovers from %s and shares the retry between callers",
    async (from, error) => {
      const expected = { ...quote(), from };
      mock.request.mockRejectedValueOnce(error).mockResolvedValueOnce(expected);
      const first = getCurrencyQuote(from as string, "USD");
      const second = getCurrencyQuote(from as string, "USD");
      await vi.advanceTimersByTimeAsync(500);
      expect(await first).toEqual(expected);
      expect(await second).toEqual(expected);
      expect(mock.request).toHaveBeenCalledTimes(2);
    },
  );

  it("stops after one retry and allows a later manual retry", async () => {
    mock.request.mockRejectedValue(new ApiRequestError("unavailable", 503));
    const failure = expect(
      getCurrencyQuote("EUR", "USD"),
    ).rejects.toMatchObject({
      code: "CURRENCY_RATE_UNAVAILABLE",
    });
    await vi.advanceTimersByTimeAsync(500);
    await failure;
    expect(mock.request).toHaveBeenCalledTimes(2);
    const expected = { ...quote(), from: "EUR" };
    mock.request.mockResolvedValueOnce(expected);
    expect(await getCurrencyQuote("EUR", "USD")).toEqual(expected);
  });

  it("does not retry invalid requests or accept invalid rates", async () => {
    mock.request.mockRejectedValueOnce(new ApiRequestError("bad request", 400));
    await expect(getCurrencyQuote("GBP", "USD")).rejects.toMatchObject({
      code: "CURRENCY_RATE_UNAVAILABLE",
    });
    expect(mock.request).toHaveBeenCalledOnce();
    mock.request.mockResolvedValueOnce({ ...quote(), rate: 0 });
    await expect(getCurrencyQuote("GBP", "USD")).rejects.toMatchObject({
      code: "CURRENCY_RATE_UNAVAILABLE",
    });
    expect(mock.request).toHaveBeenCalledTimes(2);
  });
});
