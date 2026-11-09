import {
  createPlanningCriteria,
  createManualCity,
  type CitySuggestion,
  localTripInstant,
  type PlanningCriteria,
  type GenerateRequest,
  type SelectedCity,
} from "@travel/types";
import { restorePlanningPreferences } from "./planning-preferences";
export type PlannerDraft = {
  planning: PlanningCriteria;
  cities: SelectedCity[];
  destinationQuery?: string;
  start: string;
  end: string;
  days: number;
  dated: boolean;
  flexible?: boolean;
  month?: string;
  prompt: string;
  step: number;
  style: string;
  forceRefresh: boolean;
};
export function nextPlannerDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    return "";
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
export function setPlannerDeparture(
  form: PlannerDraft,
  start: string,
): PlannerDraft {
  const next = nextPlannerDate(start);
  return {
    ...form,
    start,
    end: next && (!form.end || form.end <= start) ? next : form.end,
  };
}
// Older drafts persisted this interface prompt as if it were a user preference.
// Empty means no preference; the UI now supplies a localized placeholder.
export function normalizeCafePreference(value: string): string {
  return ["Để hệ thống đề xuất", "Let the system suggest"].includes(
    value.trim(),
  )
    ? ""
    : value;
}
export function migratePlannerDraft(draft: PlannerDraft): PlannerDraft {
  return {
    ...draft,
    planning: {
      ...draft.planning,
      dining_preferences: {
        ...draft.planning.dining_preferences,
        cafe: normalizeCafePreference(draft.planning.dining_preferences.cafe),
      },
    },
  };
}

export const emptyPlanner = (locale: "en" | "vi" = "vi"): PlannerDraft => ({
  planning: {
    ...createPlanningCriteria(),
    budget: { currency: locale === "en" ? "USD" : "VND" },
  },
  cities: [],
  destinationQuery: "",
  start: "",
  end: "",
  days: 3,
  dated: false,
  flexible: false,
  month: "",
  prompt: "",
  step: 0,
  style: "mixed",
  forceRefresh: false,
});

// Unbooked, contradictory draft times are not fixed travel commitments.
export function needsSuggestedTravelTimes(form: PlannerDraft): boolean {
  const transport = form.planning.transport_preferences;
  if (transport.confirmed) return false;
  const arrival = localTripInstant(transport.arrival_at);
  const departure = localTripInstant(transport.departure_at);
  return Boolean(
    (transport.arrival_at && arrival === null) ||
    (transport.departure_at && departure === null) ||
    (arrival !== null && departure !== null && departure <= arrival),
  );
}

export const buildPlannerRequest = (
  f: PlannerDraft,
  locale: "en" | "vi",
): GenerateRequest => ({
  cities: f.cities.map((c) => c.slug),
  city_names: f.cities.map((c) => c.name),
  ...(f.dated
    ? { start_date: f.start, end_date: f.end }
    : {
        num_days: f.days,
        ...(f.flexible ? { flexible_month: f.month ?? "" } : {}),
      }),
  budget: f.planning.budget.total,
  currency: f.planning.budget.currency,
  trip_style: f.style as GenerateRequest["trip_style"],
  force_refresh: f.forceRefresh,
  locale,
  num_travelers:
    f.planning.travelers.adults + f.planning.travelers.child_ages.length,
  planning: {
    ...f.planning,
    transport_preferences: {
      ...f.planning.transport_preferences,
      ...(needsSuggestedTravelTimes(f)
        ? { arrival_at: undefined, departure_at: undefined }
        : {}),
    },
    journey: {
      ...f.planning.journey,
      destinations: f.cities.map((c) => c.slug),
    },
    stay_preferences: {
      ...f.planning.stay_preferences,
      requirements: f.planning.stay_preferences.requirements.filter((r) =>
        r.value.trim(),
      ),
    },
    dining_preferences: {
      ...f.planning.dining_preferences,
      cafe: normalizeCafePreference(f.planning.dining_preferences.cafe),
      requirements: f.planning.dining_preferences.requirements.filter((r) =>
        r.value.trim(),
      ),
    },
    experience_preferences: {
      ...f.planning.experience_preferences,
      requirements: f.planning.experience_preferences.requirements.filter((r) =>
        r.value.trim(),
      ),
    },
  },
  prompt_text: f.prompt || undefined,
});

export function restorePlannerRequest(request: GenerateRequest): PlannerDraft {
  const form = emptyPlanner();
  const old = restorePlanningPreferences(request.prompt_text);
  const planning = request.planning ?? form.planning;
  if (!request.planning) {
    planning.journey.origin = { label: old.origin, source: "manual" };
    planning.journey.return_to_origin = old.returnToOrigin;
    if (old.endPoint)
      planning.journey.endpoint = { label: old.endPoint, source: "manual" };
    planning.travelers.adults = request.num_travelers ?? 2;
    planning.budget = {
      total: request.budget,
      currency: request.currency ?? "VND",
    };
    planning.transport_preferences.mode = old.transport;
    planning.transport_preferences.arrival_at = old.arrivalTime || undefined;
    planning.transport_preferences.departure_at =
      old.departureTime || undefined;
    planning.stay_preferences.type = old.lodging;
    planning.stay_preferences.rooms = Number(old.rooms) || 1;
    planning.stay_preferences.nightly_budget =
      Number(old.lodgingBudget) || undefined;
    if (old.lodgingCriteria)
      planning.stay_preferences.requirements = [
        { value: old.lodgingCriteria, priority: "preferred" },
      ];
    if (old.diningCriteria)
      planning.dining_preferences.requirements = [
        { value: old.diningCriteria, priority: "preferred" },
      ];
    planning.dining_preferences.cafe = old.cafeCriteria;
    if (["relaxed", "balanced", "packed"].includes(old.pace))
      planning.experience_preferences.pace =
        old.pace as PlanningCriteria["experience_preferences"]["pace"];
  }
  return migratePlannerDraft({
    ...form,
    planning,
    cities: request.cities.map((slug, i) => ({
      slug,
      name: request.city_names?.[i] ?? slug,
    })),
    start: request.start_date ?? "",
    end: request.end_date ?? "",
    dated: !request.flexible_month && !!request.start_date,
    flexible: request.flexible_month !== undefined,
    month: request.flexible_month ?? "",
    days: request.num_days ?? 3,
    style: request.trip_style,
    forceRefresh: !!request.force_refresh,
    prompt: request.prompt_text ?? "",
  });
}

const cityTextKey = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[’'\s-]+/g, "");
const cityKeys = (city: SelectedCity) =>
  [city.slug, city.name, ...Object.values(city.names ?? {})].map(cityTextKey);

/** Keep explicit city choices; an identified city can upgrade a manual name. */
export function mergePlannerCity(
  cities: SelectedCity[],
  city: SelectedCity,
): SelectedCity[] {
  const keys = new Set(cityKeys(city));
  const index = cities.findIndex(
    (selected) =>
      selected.slug === city.slug ||
      (!(selected.names && city.names) &&
        cityKeys(selected).some((key) => keys.has(key))),
  );
  if (index < 0) return [...cities, city];
  const existing = cities[index]!;
  if (existing.names && !city.names) return cities;
  return cities.map((selected, i) =>
    i === index
      ? {
          ...existing,
          ...city,
          ...(existing.names || city.names
            ? { names: { ...existing.names, ...city.names } }
            : {}),
        }
      : selected,
  );
}

/** One immutable snapshot for validation, draft saving and generation. */
export function preparePlannerSubmission(
  form: PlannerDraft,
  locale: "en" | "vi",
  suggestions: CitySuggestion[] = [],
): { draft: PlannerDraft; request: GenerateRequest } {
  const pending = form.destinationQuery?.trim() ?? "";
  let cities = form.cities.reduce<SelectedCity[]>(
    (selected, city) => mergePlannerCity(selected, city),
    [],
  );
  if (pending) {
    const matches = suggestions.filter((city) =>
      [city.slug, ...Object.values(city.name)].some(
        (name) => cityTextKey(name) === cityTextKey(pending),
      ),
    );
    const match = matches.length === 1 ? matches[0] : undefined;
    const city = match
      ? {
          slug: match.slug,
          name: match.name[locale] ?? match.name.en ?? match.slug,
          names: match.name,
        }
      : createManualCity(pending);
    cities = mergePlannerCity(cities, city);
  }
  const draft = migratePlannerDraft({
    ...form,
    cities,
    destinationQuery: "",
    forceRefresh: false,
    planning: {
      ...form.planning,
      journey: {
        ...form.planning.journey,
        origin: {
          ...form.planning.journey.origin,
          label: form.planning.journey.origin.label.trim(),
        },
      },
    },
  });
  return { draft, request: buildPlannerRequest(draft, locale) };
}

/** A language default must never silently relabel money already entered. */
export function applyPlannerCurrencyDefault(
  form: PlannerDraft,
  locale: "en" | "vi",
): PlannerDraft {
  const p = form.planning;
  if (
    [
      p.budget.total,
      p.stay_preferences.nightly_budget,
      p.dining_preferences.per_person_budget,
      p.transport_preferences.total_price,
    ].some((value) => value !== undefined)
  )
    return form;
  const currency = locale === "en" ? "USD" : "VND";
  if (p.budget.currency === currency) return form;
  return { ...form, planning: { ...p, budget: { ...p.budget, currency } } };
}
