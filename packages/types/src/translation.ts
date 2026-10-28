import type { Itinerary } from "./itinerary";
export type ItineraryLocale = "en" | "vi";
export interface ItineraryTranslation {
  id: string;
  target_locale: ItineraryLocale;
  source_locale?: ItineraryLocale;
  source_version: string;
  source_revision: number;
  stale: boolean;
  texts: Record<string, string>;
  created_at: string;
}
/** Explicit allowlist: names, user notes, bookings, timestamps and money never enter translation. */
export function itineraryTextSegments(plan: Itinerary): Record<string, string> {
  const texts: Record<string, string> = {};
  const add = (path: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) texts[path] = value;
  };
  add("overview", plan.overview);
  add("seasonal_notes.weather_note", plan.seasonal_notes?.weather_note);
  for (const field of ["highlights", "warnings"] as const)
    plan.seasonal_notes?.[field]?.forEach((s, i) =>
      add(`seasonal_notes.${field}.${i}`, s),
    );
  plan.days.forEach((day, d) =>
    day.activities.forEach((a, i) => {
      for (const field of ["description", "reason", "alternative"] as const)
        add(`days.${d}.activities.${i}.${field}`, a[field]);
      add(`days.${d}.activities.${i}.golden_moment.tip`, a.golden_moment?.tip);
      a.ticket_activities?.forEach((t, j) =>
        add(`days.${d}.activities.${i}.ticket_activities.${j}.note`, t.note),
      );
    }),
  );
  plan.hotels.forEach((h, i) => add(`hotels.${i}.note`, h.note));
  plan.restaurants.forEach((r, i) => add(`restaurants.${i}.note`, r.note));
  plan.suggestions.forEach((s, i) => {
    add(`suggestions.${i}.description`, s.description);
    add(`suggestions.${i}.note`, s.note);
  });
  return texts;
}
export function applyItineraryTranslation(
  plan: Itinerary,
  texts: Record<string, string>,
): Itinerary {
  const allowed = itineraryTextSegments(plan);
  const copy = structuredClone(plan);
  for (const [path, value] of Object.entries(texts)) {
    if (
      !Object.hasOwn(allowed, path) ||
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 12000
    )
      throw new Error("TRANSLATION_INVALID_TEXT");
    const parts = path.split(".");
    let target: Record<string, unknown> = copy as unknown as Record<
      string,
      unknown
    >;
    for (const part of parts.slice(0, -1))
      target = target[part] as Record<string, unknown>;
    target[parts.at(-1)!] = value;
  }
  return copy;
}
