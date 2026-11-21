import { itineraryRoute } from "./journey-route";
import { placeKey } from "./journey";
import type { Itinerary, PlaceLocation } from "./itinerary";
import { localizedPlanningText, localizedSystemName } from "./planning-text";
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
  const systemLabels = new Map<string, string>();
  copy.overview = localizedPlanningText(copy.overview, locale) ?? copy.overview;
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
    if (/^(?:Ngày \d+ tại |Day \d+ in )/.test(day.title))
      day.title =
        locale === "vi"
          ? `Ngày ${day.day_number} tại ${day.city}`
          : `Day ${day.day_number} in ${day.city}`;
    for (const item of day.activities) {
      const oldName = item.name;
      const generatedDescription =
        item.description ===
          `Khung giờ dự kiến cho ${oldName}. Hãy xác nhận điều kiện, thời gian và giá trước khi đi.` ||
        item.description ===
          `Provisional time for ${oldName}. Confirm conditions, timing and prices before visiting.`;
      item.name = localizedSystemName(item, locale);
      if (oldName !== item.name) systemLabels.set(oldName, item.name);
      if (generatedDescription)
        item.description =
          locale === "vi"
            ? `Khung giờ dự kiến cho ${item.name}. Hãy xác nhận điều kiện, thời gian và giá trước khi đi.`
            : `Provisional time for ${item.name}. Confirm conditions, timing and prices before visiting.`;
      item.city = name(item.city_slug ?? day.city_slug, item.city ?? day.city);
      if (item.price)
        item.price.assumption = localizedPlanningText(
          item.price.assumption,
          locale,
        );
      if (
        item.duration === `${item.duration_minutes} min` ||
        item.duration === `${item.duration_minutes} phút`
      )
        item.duration = `${item.duration_minutes} ${locale === "vi" ? "phút" : "min"}`;
    }
  }
  for (const item of [...(copy.hotels ?? []), ...(copy.restaurants ?? [])]) {
    item.city = name(item.city_slug, item.city);
    item.estimate_assumption = localizedPlanningText(
      item.estimate_assumption,
      locale,
    );
    item.note = localizedPlanningText(item.note, locale);
    if (item.evidence?.source !== "user")
      item.name = localizedPlanningText(item.name, locale) ?? item.name;
    if (item.price)
      item.price.assumption = localizedPlanningText(
        item.price.assumption,
        locale,
      );
  }
  for (const item of copy.budget_breakdown?.items ?? []) {
    item.assumption = localizedPlanningText(item.assumption, locale);
    item.label = item.label.replace(
      /^(?:Ngày|Day) (\d+): /,
      `${locale === "vi" ? "Ngày" : "Day"} $1: `,
    );
    if (["10% contingency", "Dự phòng 10%"].includes(item.label))
      item.label = locale === "vi" ? "Dự phòng 10%" : "10% contingency";
  }
  const budgetLabel = (label: string) => {
    for (const [original, translated] of systemLabels) {
      if (label === original) label = translated;
      else if (label.endsWith(`: ${original}`))
        label = `${label.slice(0, -original.length)}${translated}`;
    }
    const vi = {
      accommodation: "Lưu trú",
      food: "Ăn uống",
      activities: "Hoạt động",
      transport: "Di chuyển",
      contingency: "Dự phòng",
      flight: "Vé máy bay",
    };
    const key = label as keyof typeof vi;
    return (
      (locale === "vi"
        ? vi[key]
        : Object.entries(vi).find(([, value]) => value === label)?.[0]) ??
      label.replace(
        /^(?:Ngày|Day) (\d+): /,
        `${locale === "vi" ? "Ngày" : "Day"} $1: `,
      )
    );
  };
  if (copy.budget_breakdown) {
    for (const item of copy.budget_breakdown.items ?? [])
      item.label = budgetLabel(item.label);
    copy.budget_breakdown.missing_items =
      copy.budget_breakdown.missing_items?.map(budgetLabel);
  }
  for (const leg of copy.transport_summary ?? []) {
    if (leg.price)
      leg.price.assumption = localizedPlanningText(
        leg.price.assumption,
        locale,
      );
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
