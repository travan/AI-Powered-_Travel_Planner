import { useState, useEffect } from "react";
import type { CitySuggestion } from "@travel/types";

/**
 * Fetches popular cities from the API.
 * Results are cached by the API in Redis (30-day TTL).
 *
 * @param apiUrl - Base API URL (e.g. process.env.NEXT_PUBLIC_API_URL)
 * @param locale - Locale for display name (default "en")
 */
export function usePopularCities(apiUrl: string, locale = "en") {
  const [cities, setCities] = useState<CitySuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiUrl}/api/cities/popular`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch popular cities");
        return r.json() as Promise<CitySuggestion[]>;
      })
      .then(setCities)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Unknown error");
        setCities([]);
      })
      .finally(() => setLoading(false));
  }, [apiUrl]);

  // Helper: get display name in requested locale, fallback to "en"
  const getDisplayName = (city: CitySuggestion) =>
    city.name[locale] ?? city.name["en"] ?? Object.values(city.name)[0] ?? city.slug;

  return { cities, loading, error, getDisplayName };
}
