import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { CurrencyQuote } from "@travel/types";
import { logEvent } from "../../../observability/logger.js";

const MAX_RATE_AGE_MS = 48 * 3600_000;
const MAX_CACHE_AGE_MS = 24 * 3600_000;
const UPDATE_RECHECK_MS = 60_000;

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
    if (process.env.RUNTIME_TARGET === "cloudflare") return this.refresh();
    if (this.pending) return this.pending;
    this.pending = this.refresh();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }

  private async refresh(): Promise<Rates> {
    const signal = AbortSignal.timeout(6000);
    let code = "UPSTREAM_REQUEST_FAILED";
    let status: number | undefined;
    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD", {
        redirect: "manual",
        signal,
      });
      if (!response.ok) {
        code = "UPSTREAM_HTTP_ERROR";
        status = response.status;
        throw new Error("Exchange rate provider unavailable");
      }
      code = "UPSTREAM_INVALID_PAYLOAD";
      const body = (await response.json()) as {
        result?: unknown;
        base_code?: unknown;
        time_last_update_unix?: unknown;
        time_next_update_unix?: unknown;
        rates?: Record<string, unknown>;
      } | null;
      const now = Date.now();
      const updated = Number(body?.time_last_update_unix) * 1000;
      const next = Number(body?.time_next_update_unix) * 1000;
      const usableUntil = updated + MAX_RATE_AGE_MS;
      if (
        body?.result !== "success" ||
        body.base_code !== "USD" ||
        body.rates?.USD !== 1 ||
        !Number.isFinite(updated) ||
        usableUntil <= now ||
        updated > now + 300_000 ||
        !Number.isFinite(next) ||
        next <= updated
      )
        throw new Error("Invalid or outdated exchange rates");

      // A concurrent Worker request may already have cached a newer table.
      if (
        this.cached &&
        this.cached.expires > now &&
        this.cached.updated > updated
      )
        return this.cached;

      this.cached = {
        rates: Object.fromEntries(
          Object.entries(body.rates).filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === "number" &&
              Number.isFinite(entry[1]) &&
              entry[1] > 0,
          ),
        ),
        updated,
        expires: Math.min(
          next > now ? next : now + UPDATE_RECHECK_MS,
          now + MAX_CACHE_AGE_MS,
          usableUntil,
        ),
      };
      return this.cached;
    } catch {
      logEvent("currency.refresh_failed", "warn", {
        code: signal.aborted ? "UPSTREAM_TIMEOUT" : code,
        status,
      });
      throw new ServiceUnavailableException({
        code: "CURRENCY_RATE_UNAVAILABLE",
        message:
          "Exchange rates are unavailable; original amounts were retained.",
      });
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
    ) {
      logEvent("currency.quote_failed", "warn", { code: "RATE_MISSING" });
      throw new ServiceUnavailableException({
        code: "CURRENCY_RATE_UNAVAILABLE",
        message: "Currency rate unavailable",
      });
    }
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
