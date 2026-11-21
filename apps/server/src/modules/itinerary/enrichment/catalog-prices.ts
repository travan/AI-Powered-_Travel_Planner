import type { CurrencyQuote, ScopedPrice, Itinerary } from "@travel/types";
import { currentCatalogPrice, hasPriceEvidence } from "@travel/types";
import type {
  CityActivity,
  CityPlanningData,
} from "../../cities/domain/city.entity.js";
import type { CurrencyService } from "./currency.service.js";

type Rates = Pick<CurrencyService, "quote">;

export function catalogPrice(
  activity: CityActivity,
  currency: string,
  scope: ScopedPrice["scope"],
): ScopedPrice {
  return {
    ...activity.price,
    amount:
      currentCatalogPrice(activity) && activity.currency === currency
        ? activity.estimated_cost
        : null,
    currency,
    scope,
    status: "estimated",
    basis: "catalog",
    evidence: {
      source: "catalog",
      source_id: activity.id,
      verified_at: activity.last_verified_at,
    },
  };
}

function priceConverter(currency: string, service?: Rates) {
  const quotes = new Map<string, Promise<CurrencyQuote | undefined>>();
  return async (price: ScopedPrice): Promise<ScopedPrice> => {
    // Renew expired conversions from the native amount, never convert a converted amount twice.
    const native: ScopedPrice = price.original
      ? {
          ...price,
          amount: price.original.amount,
          currency: price.original.currency,
          original: undefined,
          conversion: undefined,
        }
      : price;
    if (native.currency === currency || !hasPriceEvidence(native)) return price;
    const from = native.currency;
    if (!quotes.has(from))
      quotes.set(
        from,
        service?.quote(from, currency).catch(() => undefined) ??
          Promise.resolve(undefined),
      );
    const quote = await quotes.get(from);
    const valid =
      quote &&
      quote.from === from &&
      quote.to === currency &&
      Number.isFinite(quote.rate) &&
      quote.rate > 0 &&
      Date.parse(quote.expires_at) > Date.now();
    const raw = valid ? native.amount! * quote.rate : null;
    const amount =
      raw != null && Number.isFinite(raw)
        ? Number(
            raw.toFixed(
              new Intl.NumberFormat("en", {
                style: "currency",
                currency,
              }).resolvedOptions().maximumFractionDigits,
            ),
          )
        : null;
    return {
      ...price,
      currency,
      amount,
      original: { amount: native.amount!, currency: from },
      conversion: valid ? quote : undefined,
    };
  };
}

/** Convert a copy. A failed quote leaves the original value available for inspection only. */
export async function convertCatalogPrices(
  cities: CityPlanningData[],
  currency: string,
  service?: Rates,
): Promise<CityPlanningData[]> {
  const convert = priceConverter(currency, service);
  return Promise.all(
    cities.map(async (city) => ({
      ...city,
      activities: await Promise.all(
        city.activities.map(async (activity) => {
          if (
            !currentCatalogPrice(activity) ||
            activity.estimated_cost == null ||
            activity.estimated_cost < 0 ||
            activity.currency === currency
          )
            return activity;
          const price = await convert(
            catalogPrice(activity, activity.currency, "person"),
          );
          return { ...activity, currency, estimated_cost: price.amount, price };
        }),
      ),
    })),
  );
}

export async function convertPlanPrices(
  plan: Itinerary,
  service?: Rates,
): Promise<Itinerary> {
  const copy = structuredClone(plan);
  const convert = priceConverter(copy.currency, service);
  for (const item of [
    ...(copy.days ?? []).flatMap((day) => day.activities ?? []),
    ...(copy.transport_summary ?? []),
    ...(copy.hotels ?? []),
    ...(copy.restaurants ?? []),
  ]) {
    if (
      !item.price ||
      (item.price.currency === copy.currency &&
        (!item.price.original || hasPriceEvidence(item.price)))
    )
      continue;
    item.price = await convert(item.price);
    if ("cost" in item) {
      item.cost =
        item.price.amount == null
          ? null
          : item.price.amount *
            (item.price.scope === "person" ? copy.num_travelers : 1);
      item.currency = item.price.currency;
    }
  }
  return copy;
}
