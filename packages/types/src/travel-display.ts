import { itineraryRoute } from "./journey-route";
import { placeKey } from "./journey";
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
  const aliases = new Map<string, Record<string, string>>();
  for (const [slug, city] of Object.entries(copy.city_catalog ?? {}))
    for (const label of [slug, ...Object.values(city.name)])
      aliases.set(placeKey(label), city.name);
  const route = itineraryRoute(copy);
  for (const point of [route.origin, route.end])
    if (point?.names) aliases.set(placeKey(point.label), point.names);
  const name = (slug?: string, fallback = "") => {
    const names =
      (slug ? copy.city_catalog?.[slug]?.name : undefined) ??
      aliases.get(placeKey(fallback));
    return names?.[locale] ?? names?.en ?? fallback;
  };
  for (const day of copy.days ?? []) {
    day.city = day.city_names?.[locale] ?? name(day.city_slug, day.city);
    for (const item of day.activities)
      item.city = name(item.city_slug ?? day.city_slug, item.city ?? day.city);
  }
  for (const item of [...(copy.hotels ?? []), ...(copy.restaurants ?? [])])
    item.city = name(item.city_slug, item.city);
  for (const leg of copy.transport_summary ?? []) {
    const segment = leg.segment?.split(/\s*(?:→|->)\s*/);
    leg.from = name(leg.from_city_slug, leg.from);
    leg.to = name(leg.to_city_slug, leg.to);
    if (
      segment?.length === 2 &&
      placeKey(name(undefined, segment[0])) === placeKey(leg.from) &&
      placeKey(name(undefined, segment[1])) === placeKey(leg.to)
    )
      leg.segment = `${leg.from} → ${leg.to}`;
  }
  for (const issue of copy.issues ?? []) {
    if (issue.code !== "JOURNEY_LEG_MISSING" || !issue.params) continue;
    for (const field of ["from", "to"])
      if (typeof issue.params[field] === "string")
        issue.params[field] = name(undefined, issue.params[field]);
  }
  return copy;
}
