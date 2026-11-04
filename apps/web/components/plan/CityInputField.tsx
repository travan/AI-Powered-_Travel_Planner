"use client";
import { useAppLanguage } from "../i18n/LanguageProvider";
import { UiText, useUiText } from "../i18n/UiText";

import { useState, useRef, useEffect } from "react";
import { searchCities } from "../../lib/api";
import { Badge } from "@travel/ui";

interface Props {
  cities: string[];
  onChange: (cities: string[]) => void;
}

export function CityInputField({ cities, onChange }: Props) {
  const t = useUiText();
  const { locale } = useAppLanguage();

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<
    { slug: string; name: Record<string, string>; country: string }[]
  >([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await searchCities(query);
      setSuggestions(results);
      setOpen(true);
    }, 300);
  }, [query]);

  const addCity = (name: string) => {
    if (!cities.includes(name)) onChange([...cities, name]);
    setQuery("");
    setSuggestions([]);
    setOpen(false);
  };

  const removeCity = (name: string) => {
    onChange(cities.filter((c) => c !== name));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      const exact = suggestions.filter(s => Object.values(s.name).some(n => n.toLowerCase() === query.trim().toLowerCase()));
      if (exact.length === 1) addCity(exact[0]!.name.en ?? exact[0]!.slug);
    }
  };

  return (
    <div className="space-y-3">
      {/* Selected cities */}
      {cities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cities.map((city, idx) => (
            <div
              key={city}
              className="flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-sm text-brand-800"
            >
              <span className="text-xs text-brand-500">#{idx + 1}</span>
              {city}
              <button
                type="button"
                onClick={() => removeCity(city)}
                className="ml-1 text-brand-400 hover:text-brand-700"
              >
                {" "}
                <UiText id="t67fba2f357af" fallback="×" />{" "}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("Search city (e.g. Da Nang, Tokyo, Paris)…")}
          className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />

        {/* Suggestions dropdown */}
        {open && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {suggestions.map((s) => (
              <li key={s.slug}>
                <button
                  type="button"
                  onClick={() => addCity(s.name["en"] ?? s.slug)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-gray-50"
                >
                  <span className="flex-1 font-medium text-gray-900">
                    {s.name[locale] ?? s.name.en ?? s.slug}
                  </span>
                  <Badge variant="outline">{s.country}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-gray-500">
        {" "}
        <UiText
          id="tfd5cc6b41ec0"
          fallback="Press Enter to add a city. Add multiple cities for a multi-destination trip."
        />{" "}
      </p>
    </div>
  );
}
