import { useState, useEffect } from "react";
import type { CitySuggestion } from "@travel/types";

/**
 * Debounced city autocomplete hook.
 * Works on both web (Next.js) and mobile (Expo/React Native).
 *
 * @param query   - Current text input value
 * @param apiUrl  - Base API URL (e.g. process.env.NEXT_PUBLIC_API_URL)
 * @param delay   - Debounce delay in ms (default 300)
 */
export function useCitySearch(query: string, apiUrl: string, delay = 300) {
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    // Enter the loading state as soon as the current query is valid. This
    // avoids briefly rendering "No results" during the debounce window.
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${apiUrl}/api/cities/search?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal }
        );
        if (!active) return;
        if (res.ok) {
          const data = await res.json() as CitySuggestion[];
          if (!active) return;
          setSuggestions(data);
        } else {
          setSuggestions([]);
        }
      } catch (error) {
        if (!active || (error instanceof Error && error.name === "AbortError")) return;
        setSuggestions([]);
      } finally {
        if (active) setLoading(false);
      }
    }, delay);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, apiUrl, delay]);

  return { suggestions, loading };
}
