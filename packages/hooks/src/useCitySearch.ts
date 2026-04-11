import { useState, useEffect, useRef } from "react";
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
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${apiUrl}/api/cities/search?q=${encodeURIComponent(query)}`
        );
        if (res.ok) {
          const data = await res.json() as CitySuggestion[];
          setSuggestions(data);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, apiUrl, delay]);

  // Clear suggestions when query is cleared
  useEffect(() => {
    if (query.length === 0) setSuggestions([]);
  }, [query]);

  return { suggestions, loading };
}
