import type { ScopedPrice } from "./journey";

export function currentCatalogPrice(value: {
  source: string;
  last_verified_at?: string;
}): boolean {
  const verified = Date.parse(value.last_verified_at ?? "");
  return (
    !["ai_generated", "user_added", "user_submission"].includes(value.source) &&
    Number.isFinite(verified) &&
    verified <= Date.now() &&
    Date.now() - verified <= 180 * 86400000
  );
}

/** A descriptive disclaimer, venue identity or AI-supplied URL is not price evidence. */
export function hasPriceEvidence(price?: ScopedPrice): boolean {
  if (
    !price ||
    price.amount == null ||
    !Number.isFinite(price.amount) ||
    price.amount < 0
  )
    return false;
  if (
    price.original &&
    price.original.currency !== price.currency &&
    (!price.conversion ||
      price.conversion.from !== price.original.currency ||
      price.conversion.to !== price.currency ||
      !Number.isFinite(price.conversion.rate) ||
      price.conversion.rate <= 0 ||
      !(Date.parse(price.conversion.expires_at) > Date.now()))
  )
    return false;
  if (price.status === "user_confirmed" || price.evidence?.source === "user")
    return true;
  return (
    price.evidence?.source === "catalog" &&
    currentCatalogPrice({
      source: "catalog",
      last_verified_at: price.evidence.verified_at,
    })
  );
}
