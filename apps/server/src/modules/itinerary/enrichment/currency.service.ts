import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { CurrencyQuote } from "@travel/types";

type Rates = {
  rates: Record<string, number>;
  updated: number;
  expires: number;
};
@Injectable()
export class CurrencyService {
  private cached?: Rates;
  private pending?: Promise<Rates>;

  private async latest(): Promise<Rates> {
    if (this.cached && this.cached.expires > Date.now()) return this.cached;
    if (this.pending) return this.pending;
    this.pending = (async () => {
      try {
        const response = await fetch("https://open.er-api.com/v6/latest/USD", {
          redirect: "error",
          signal: AbortSignal.timeout(6000),
        });
        if (!response.ok) throw new Error("Exchange rate provider unavailable");
        const body = (await response.json()) as {
          result?: unknown;
          base_code?: unknown;
          time_last_update_unix?: unknown;
          time_next_update_unix?: unknown;
          rates?: Record<string, unknown>;
        };
        if (!body || typeof body !== "object")
          throw new Error("Invalid exchange rate response");
        const updated = Number(body.time_last_update_unix) * 1000;
        const next = Number(body.time_next_update_unix) * 1000;
        if (
          body.result !== "success" ||
          body.base_code !== "USD" ||
          body.rates?.USD !== 1 ||
          !Number.isFinite(updated) ||
          updated < Date.now() - 48 * 3600000 ||
          updated > Date.now() + 300000 ||
          !Number.isFinite(next) ||
          next <= updated ||
          next <= Date.now()
        )
          throw new Error("Invalid or outdated exchange rates");
        this.cached = {
          rates: Object.fromEntries(
            Object.entries(body.rates ?? {}).filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === "number" &&
                Number.isFinite(entry[1]) &&
                entry[1] > 0,
            ),
          ),
          updated,
          expires: Math.min(next, Date.now() + 24 * 3600000),
        };
        return this.cached;
      } catch {
        throw new ServiceUnavailableException({
          code: "CURRENCY_RATE_UNAVAILABLE",
          message:
            "Exchange rates are unavailable; original amounts were retained.",
        });
      }
    })();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }

  async quote(from: string, to: string): Promise<CurrencyQuote> {
    const data = await this.latest();
    const source = data.rates[from],
      target = data.rates[to];
    if (
      !Number.isFinite(source) ||
      !Number.isFinite(target) ||
      source! <= 0 ||
      target! <= 0
    )
      throw new ServiceUnavailableException({
        code: "CURRENCY_RATE_UNAVAILABLE",
        message: "Currency rate unavailable",
      });
    return {
      from,
      to,
      rate: target! / source!,
      updated_at: new Date(data.updated).toISOString(),
      expires_at: new Date(data.expires).toISOString(),
      source_url: "https://www.exchangerate-api.com",
    };
  }
}
