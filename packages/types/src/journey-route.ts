import { placeKey } from "./journey";
import type { Itinerary } from "./itinerary";
import type { JourneyLocation, PlanningCriteria } from "./journey";

export type RoutePlace = {
  slug?: string;
  label: string;
  names?: Record<string, string>;
};
export type JourneyRoute = {
  origin?: RoutePlace;
  destinations: RoutePlace[];
  end?: RoutePlace;
};

export function placeLabel(place: RoutePlace, locale: string): string {
  return (place.names?.[locale] ?? place.names?.en ?? place.label)
    .trim()
    .replace(/\s+/g, " ");
}

export function routeLabels(route: JourneyRoute, locale: string): string[] {
  const stops = [route.origin, ...route.destinations, route.end].filter(
    (stop): stop is RoutePlace => !!stop?.label.trim(),
  );
  return stops
    .filter((stop, index) => {
      const previous = stops[index - 1];
      return (
        !previous ||
        placeKey(previous.slug ?? previous.label) !==
          placeKey(stop.slug ?? stop.label)
      );
    })
    .map((stop) => placeLabel(stop, locale));
}

export function journeyRoute(
  journey: PlanningCriteria["journey"] | undefined,
  destinations: RoutePlace[],
  catalog?: Itinerary["city_catalog"],
): JourneyRoute {
  const find = (slug?: string, label = "") => {
    if (slug && catalog?.[slug]) return slug;
    return Object.keys(catalog ?? {}).find((key) =>
      [key, ...Object.values(catalog?.[key]?.name ?? {})].some(
        (name) => placeKey(name) === placeKey(label),
      ),
    );
  };
  const location = (value?: JourneyLocation): RoutePlace | undefined => {
    if (!value?.label.trim()) return undefined;
    const key = find(undefined, value.label);
    return {
      slug: key ?? (value.names ? value.city_slug : undefined),
      label: value.label,
      names:
        value.source === "browser"
          ? { vi: "Vị trí hiện tại", en: "Current location" }
          : (value.names ?? (key ? catalog?.[key]?.name : undefined)),
    };
  };
  const origin = location(journey?.origin);
  return {
    origin,
    destinations: destinations.map((stop) => {
      const key = find(stop.slug, stop.label);
      return {
        ...stop,
        slug: key ?? stop.slug,
        names: stop.names ?? (key ? catalog?.[key]?.name : undefined),
      };
    }),
    end: journey?.return_to_origin ? origin : location(journey?.endpoint),
  };
}

export function itineraryRoute(plan: Itinerary): JourneyRoute {
  const journey = plan.planning?.journey;
  const destinations = journey?.destinations?.length
    ? journey.destinations.map((slug) => ({
        slug,
        label: plan.city_catalog?.[slug]?.name.en ?? slug,
      }))
    : (plan.days ?? []).map((day) => ({
        slug: day.city_slug,
        label: day.city,
        names: day.city_names,
      }));
  return journeyRoute(journey, destinations, plan.city_catalog);
}
