import type { GenerateRequest, GenerateResponse } from "./api";
import type { CitySuggestion, TripStyleKey } from "./constants";

export interface SelectedCity {
  slug: string;
  name: string;
}

export interface PlannerFormState {
  cities: SelectedCity[];
  use_date_range: boolean;
  num_days: number;
  start_date: string;
  end_date: string;
  budget: string;
  currency: string;
  trip_style: string;
  traveler_count: number;
}

interface BuildGenerateRequestInput {
  cities: SelectedCity[];
  use_date_range?: boolean;
  start_date?: string;
  end_date?: string;
  num_days?: number | string;
  budget?: number | string | null;
  currency?: string;
  trip_style: TripStyleKey;
  num_travelers?: number | string;
  locale?: string;
}

export type GenerateNavigationTarget =
  | { kind: "queued"; id: string }
  | { kind: "cached"; id: string };

export function createManualCity(input: string): SelectedCity {
  const trimmed = input.trim();
  return {
    slug: trimmed.toLowerCase().replace(/\s+/g, "-"),
    name: trimmed,
  };
}

export function createCityFromSuggestion(
  suggestion: CitySuggestion,
  locale = "en"
): SelectedCity {
  return {
    slug: suggestion.slug,
    name:
      suggestion.name[locale] ??
      suggestion.name.en ??
      Object.values(suggestion.name)[0] ??
      suggestion.slug,
  };
}

export function buildGenerateRequest(input: BuildGenerateRequestInput): GenerateRequest {
  const budget =
    input.budget === null || input.budget === undefined || input.budget === ""
      ? undefined
      : Number(input.budget);

  const numTravelers = Math.max(1, Number(input.num_travelers) || 1);
  const numDays = Math.max(1, Number(input.num_days) || 1);

  return {
    cities: input.cities.map((city) => city.slug),
    city_names: input.cities.map((city) => city.name),
    ...(input.use_date_range && input.start_date
      ? {
          start_date: input.start_date,
          end_date: input.end_date || undefined,
        }
      : {
          num_days: numDays,
        }),
    budget,
    currency: input.currency ?? "USD",
    trip_style: input.trip_style,
    num_travelers: numTravelers,
    locale: input.locale ?? "en",
  };
}

export function resolveGenerateNavigationTarget(
  response: GenerateResponse
): GenerateNavigationTarget | null {
  if (response.status === "queued") {
    return response.job_id ? { kind: "queued", id: response.job_id } : null;
  }

  return response.itinerary_id
    ? { kind: "cached", id: response.itinerary_id }
    : null;
}
