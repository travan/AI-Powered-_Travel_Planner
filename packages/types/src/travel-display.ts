import type { Itinerary, PlaceLocation } from "./itinerary";
export function mapUrl(place: PlaceLocation & { name: string }): string {
  const query = [place.name, place.address, place.city, place.country]
    .filter(Boolean)
    .join(", ");
  const params = new URLSearchParams({ api: "1", query });
  if (place.map_precision === "verified" && place.google_place_id)
    params.set("query_place_id", place.google_place_id);
  else if (
    place.map_precision === "verified" &&
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lon)
  )
    params.set("query", `${place.lat},${place.lon}`);
  return `https://www.google.com/maps/search/?${params}`;
}
export function localizedPlan(plan: Itinerary, locale: string): Itinerary {
  const copy = structuredClone(plan);
  const name = (slug?: string, fallback = "") =>
    slug
      ? (copy.city_catalog?.[slug]?.name[locale] ??
        copy.city_catalog?.[slug]?.name.en ??
        fallback)
      : fallback;
  for (const day of copy.days ?? []) {
    day.city = day.city_names?.[locale] ?? name(day.city_slug, day.city);
    for (const item of day.activities)
      item.city = name(item.city_slug ?? day.city_slug, item.city ?? day.city);
  }
  for (const item of [...(copy.hotels ?? []), ...(copy.restaurants ?? [])])
    item.city = name(item.city_slug, item.city);
  for (const leg of copy.transport_summary ?? []) {
    leg.from = name(leg.from_city_slug, leg.from);
    leg.to = name(leg.to_city_slug, leg.to);
  }
  return copy;
}
