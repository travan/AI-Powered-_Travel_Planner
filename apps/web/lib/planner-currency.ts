import type { CurrencyQuote } from "@travel/types";
import { journeyRequest } from "./journey-api";
import { ApiRequestError } from "./api";
import type { PlannerDraft } from "./planner-model";

const quotes = new Map<string, Promise<CurrencyQuote>>();

async function requestCurrencyQuote(
  from: string,
  to: string,
): Promise<CurrencyQuote> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await journeyRequest<CurrencyQuote>(
        `currency/quote?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        undefined,
        undefined,
        "GET",
        AbortSignal.timeout(9000),
      );
    } catch (error) {
      const transient =
        error instanceof ApiRequestError
          ? error.status === 0 || error.status === 429 || error.status >= 500
          : error instanceof TypeError ||
            (error instanceof Error &&
              (error.name === "TimeoutError" || error.name === "AbortError"));
      if (attempt >= 1 || !transient) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

export async function getCurrencyQuote(
  from: string,
  to: string,
): Promise<CurrencyQuote> {
  const key = `${from}:${to}`;
  let quote = quotes.get(key);
  const wasCached = !!quote;
  if (!quote) {
    quote = requestCurrencyQuote(from, to);
    quotes.set(key, quote);
  }
  try {
    const result = await quote;
    if (
      result.from !== from ||
      result.to !== to ||
      !Number.isFinite(result.rate) ||
      result.rate <= 0 ||
      !Number.isFinite(Date.parse(result.expires_at))
    )
      throw new Error("Invalid exchange rate");
    if (Date.parse(result.expires_at) <= Date.now()) {
      quotes.delete(key);
      if (wasCached) return getCurrencyQuote(from, to);
      throw new Error("Exchange rate expired");
    }
    return result;
  } catch {
    quotes.delete(key);
    throw new ApiRequestError(
      "Exchange rate unavailable",
      503,
      "CURRENCY_RATE_UNAVAILABLE",
    );
  }
}

export const plannerMoneyKey = (form: PlannerDraft) =>
  JSON.stringify([
    form.planning.budget.currency,
    form.planning.budget.total,
    form.planning.stay_preferences.nightly_budget,
    form.planning.dining_preferences.per_person_budget,
    form.planning.transport_preferences.total_price,
  ]);
export const hasPlannerMoney = (form: PlannerDraft) =>
  [
    form.planning.budget.total,
    form.planning.stay_preferences.nightly_budget,
    form.planning.dining_preferences.per_person_budget,
    form.planning.transport_preferences.total_price,
  ].some((amount) => amount !== undefined);

export function withPlannerMoney(
  form: PlannerDraft,
  money: PlannerDraft,
): PlannerDraft {
  return {
    ...form,
    planning: {
      ...form.planning,
      budget: { ...money.planning.budget },
      stay_preferences: {
        ...form.planning.stay_preferences,
        nightly_budget: money.planning.stay_preferences.nightly_budget,
      },
      dining_preferences: {
        ...form.planning.dining_preferences,
        per_person_budget: money.planning.dining_preferences.per_person_budget,
      },
      transport_preferences: {
        ...form.planning.transport_preferences,
        total_price: money.planning.transport_preferences.total_price,
      },
    },
  };
}
export function convertPlannerCurrency(
  form: PlannerDraft,
  quote: CurrencyQuote,
): PlannerDraft {
  if (
    quote.from !== form.planning.budget.currency ||
    !Number.isFinite(quote.rate) ||
    quote.rate <= 0
  )
    throw new Error("Invalid exchange rate");
  const digits =
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: quote.to,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const scale = 10 ** digits;
  const convert = (amount: number | undefined) => {
    if (amount === undefined) return undefined;
    if (!Number.isFinite(amount)) throw new Error("Invalid amount");
    const value =
      Math.round((amount * quote.rate + Number.EPSILON) * scale) / scale;
    if (!Number.isFinite(value)) throw new Error("Invalid converted amount");
    return value;
  };
  return withPlannerMoney(form, {
    ...form,
    planning: {
      ...form.planning,
      budget: {
        currency: quote.to,
        total: convert(form.planning.budget.total),
      },
      stay_preferences: {
        ...form.planning.stay_preferences,
        nightly_budget: convert(form.planning.stay_preferences.nightly_budget),
      },
      dining_preferences: {
        ...form.planning.dining_preferences,
        per_person_budget: convert(
          form.planning.dining_preferences.per_person_budget,
        ),
      },
      transport_preferences: {
        ...form.planning.transport_preferences,
        total_price: convert(form.planning.transport_preferences.total_price),
      },
    },
  });
}
