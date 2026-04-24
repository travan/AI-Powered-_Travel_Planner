"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "../../../components/layout/SiteHeader";
import { generateItinerary } from "../../../lib/api";
import { createClient } from "../../../lib/supabase/client";
import { useCitySearch, usePopularCities } from "@travel/hooks";
import {
  TRIP_STYLES,
  buildGenerateRequest,
  createCityFromSuggestion,
  createManualCity,
  resolveGenerateNavigationTarget,
  type SelectedCity,
  type TripStyleKey,
} from "@travel/types";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "";
const PENDING_SEARCH_INTENT_KEY = "horizon.search.intent";
const PENDING_SEARCH_INTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PendingSearchIntent = {
  request: ReturnType<typeof buildGenerateRequest>;
  createdAt: number;
};

function shouldRestorePendingSearchIntent(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === "Generation response is missing the next route target.") return true;

  const statusMatch = error.message.match(/Generate failed: (\d+)/);
  if (!statusMatch) return false;

  const status = Number(statusMatch[1]);
  return status === 400 || status === 422;
}

// Fallback gradient backgrounds for cities without a cover_image
const GRADIENT_FALLBACKS = [
  "from-primary/70 to-secondary/60",
  "from-secondary/70 to-tertiary/60",
  "from-tertiary/70 to-primary/60",
  "from-primary-container/80 to-secondary-container/70",
];

// Cycles through col-span-2 / col-span-1 / col-span-1 / col-span-2 bento pattern
const SPAN_CYCLE = ["col-span-2", "col-span-1", "col-span-1", "col-span-2"];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function PlanPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResumingRef = useRef(false);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [cities, setCities] = useState<SelectedCity[]>([]);
  const [cityInput, setCityInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [numDays, setNumDays] = useState(7);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [useDateRange, setUseDateRange] = useState(false);
  const [budgetValue, setBudgetValue] = useState(3500);
  const [currency, setCurrency] = useState("USD");
  const [tripStyle, setTripStyle] = useState<TripStyleKey>("mid_range");
  const [numTravelers, setNumTravelers] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Data from API ──────────────────────────────────────────────────────────
  const { suggestions, loading: searchLoading } = useCitySearch(cityInput, API_URL);
  const { cities: popularCities, loading: popularLoading, getDisplayName } = usePopularCities(API_URL);

  // Close suggestions dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Resume a blocked generate intent after successful authentication.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isResumingRef.current) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("resumeGenerate") !== "1") return;

    const rawIntent = window.sessionStorage.getItem(PENDING_SEARCH_INTENT_KEY);
    if (!rawIntent) return;

    let parsed: PendingSearchIntent | null = null;
    try {
      parsed = JSON.parse(rawIntent) as PendingSearchIntent;
    } catch {
      window.sessionStorage.removeItem(PENDING_SEARCH_INTENT_KEY);
      return;
    }

    if (!parsed || !parsed.request || Date.now() - parsed.createdAt > PENDING_SEARCH_INTENT_MAX_AGE_MS) {
      window.sessionStorage.removeItem(PENDING_SEARCH_INTENT_KEY);
      return;
    }

    isResumingRef.current = true;
    void (async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        isResumingRef.current = false;
        return;
      }

      setLoading(true);
      setError(null);
      const serializedIntent = JSON.stringify(parsed);

      try {
        window.sessionStorage.removeItem(PENDING_SEARCH_INTENT_KEY);

        const response = await generateItinerary(parsed.request, session.access_token);
        const target = resolveGenerateNavigationTarget(response);
        if (!target) {
          throw new Error("Generation response is missing the next route target.");
        }
        router.replace(`/trips?source=${target.kind}&id=${target.id}`);
      } catch (e: unknown) {
        if (shouldRestorePendingSearchIntent(e)) {
          window.sessionStorage.setItem(PENDING_SEARCH_INTENT_KEY, serializedIntent);
        }
        setError(e instanceof Error ? e.message : "Failed to generate itinerary. Please try again.");
        isResumingRef.current = false;
        setLoading(false);
      }
    })();
  }, [router]);

  // ── City helpers ───────────────────────────────────────────────────────────
  const addCity = (slug: string, displayName: string) => {
    if (!cities.some((c) => c.slug === slug)) {
      setCities((p) => [...p, { slug, name: displayName }]);
    }
    setCityInput("");
    setShowSuggestions(false);
  };

  const addCityFromInput = () => {
    const trimmed = cityInput.trim();
    if (!trimmed) return;
    const match = suggestions[0];
    if (match) {
      const selectedCity = createCityFromSuggestion(match);
      addCity(selectedCity.slug, selectedCity.name);
    } else {
      const selectedCity = createManualCity(trimmed);
      addCity(selectedCity.slug, selectedCity.name);
    }
  };

  const removeCity = (slug: string) =>
    setCities((p) => p.filter((c) => c.slug !== slug));

  // ── Generate ───────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!cities.length) return;
    setLoading(true);
    setError(null);

    const requestPayload = buildGenerateRequest({
      cities,
      use_date_range: useDateRange,
      start_date: startDate,
      end_date: endDate,
      num_days: numDays,
      budget: budgetValue,
      currency,
      trip_style: tripStyle,
      num_travelers: numTravelers,
      locale: "en",
    });

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        if (typeof window !== "undefined") {
          const intent: PendingSearchIntent = {
            request: requestPayload,
            createdAt: Date.now(),
          };
          window.sessionStorage.setItem(PENDING_SEARCH_INTENT_KEY, JSON.stringify(intent));
        }

        const query = new URLSearchParams({ redirectTo: "/plan?resumeGenerate=1" }).toString();
        router.push(`/login?${query}`);
        return;
      }

      const response = await generateItinerary(requestPayload, session.access_token);

      const target = resolveGenerateNavigationTarget(response);
      if (!target) {
        throw new Error("Generation response is missing the next route target.");
      }

      router.push(`/trips?source=${target.kind}&id=${target.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate itinerary. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const budgetPct = Math.round(((budgetValue - 500) / (10000 - 500)) * 100);

  return (
    <div className="bg-background text-on-surface min-h-screen">
      <SiteHeader />

      {/* ═══════════════════════ MOBILE LAYOUT ═══════════════════════ */}
      <div className="md:hidden pb-32">
        <main className="pt-20">
          {/* Hero */}
          <section className="px-6 py-8">
            <div className="relative h-64 w-full rounded-xl overflow-hidden mb-8 bg-primary/10">
              <div className="absolute inset-0 bg-linear-to-t from-primary/80 to-transparent z-10" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary/20 text-9xl">travel_explore</span>
              </div>
              <div className="absolute bottom-6 left-6 z-20">
                <h1 className="text-4xl font-headline font-extrabold text-on-primary tracking-tight">
                  Where to next?
                </h1>
                <p className="text-on-primary-container/80 font-medium">Define your escape.</p>
              </div>
            </div>

            <div className="space-y-8">
              {/* Destinations */}
              <div className="space-y-4" ref={containerRef}>
                <label className="block text-sm font-bold uppercase tracking-widest text-outline">
                  Destinations
                </label>
                <div
                  className="bg-surface-container-high rounded-xl p-4 min-h-14 flex flex-wrap gap-2 items-center cursor-text"
                  onClick={() => inputRef.current?.focus()}
                >
                  {cities.map((c) => (
                    <div
                      key={c.slug}
                      className="flex items-center gap-2 bg-primary-fixed text-on-primary-fixed px-3 py-1.5 rounded-full text-sm font-semibold"
                    >
                      {c.name}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeCity(c.slug); }}
                        className="material-symbols-outlined text-sm leading-none"
                        aria-label={`Remove ${c.name}`}
                      >
                        close
                      </button>
                    </div>
                  ))}
                  <button
                    className="flex items-center gap-1 text-primary font-bold text-sm px-2"
                    onClick={() => inputRef.current?.focus()}
                  >
                    <span className="material-symbols-outlined text-lg">add</span> Add city
                  </button>
                  <input
                    ref={inputRef}
                    className="sr-only"
                    value={cityInput}
                    onChange={(e) => { setCityInput(e.target.value); setShowSuggestions(true); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addCityFromInput(); }
                      if (e.key === "Backspace" && !cityInput && cities.length) setCities((p) => p.slice(0, -1));
                    }}
                    aria-label="Add city"
                  />
                </div>

                {/* Mobile autocomplete dropdown */}
                {showSuggestions && cityInput.length >= 2 && (
                  <div className="bg-surface-container-highest rounded-xl shadow-lg border border-outline-variant/20 overflow-hidden">
                    {searchLoading && <div className="px-4 py-3 text-sm text-outline">Searching…</div>}
                    {!searchLoading && suggestions.length === 0 && (
                      <div className="px-4 py-3 text-sm text-outline">No results for &quot;{cityInput}&quot;</div>
                    )}
                    {suggestions.map((s) => (
                      <button
                        key={s.slug}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high text-left transition-colors"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addCity(s.slug, s.name["en"] ?? s.slug)}
                      >
                        <span className="material-symbols-outlined text-primary text-base">location_on</span>
                        <span className="font-semibold text-sm">{s.name["en"] ?? s.slug}</span>
                        <span className="ml-auto text-xs font-bold text-outline bg-surface-container px-2 py-0.5 rounded-full">
                          {s.country}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Duration */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-bold uppercase tracking-widest text-outline">Duration</label>
                  <button
                    className="text-xs font-bold text-primary uppercase tracking-widest"
                    onClick={() => setUseDateRange((v) => !v)}
                  >
                    {useDateRange ? "Use days" : "Use dates"}
                  </button>
                </div>
                {useDateRange ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface-container-high rounded-xl p-4">
                      <label className="text-xs text-outline block mb-1">From</label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                        className="bg-transparent text-on-surface text-sm font-bold w-full outline-none" />
                    </div>
                    <div className="bg-surface-container-high rounded-xl p-4">
                      <label className="text-xs text-outline block mb-1">To</label>
                      <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
                        className="bg-transparent text-on-surface text-sm font-bold w-full outline-none" />
                    </div>
                  </div>
                ) : (
                  <div className="bg-surface-container-high rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary">calendar_month</span>
                      <span className="font-bold text-on-surface">{numDays} day{numDays !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setNumDays((d) => Math.max(1, d - 1))}
                        className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary font-bold" aria-label="Decrease days">−</button>
                      <button onClick={() => setNumDays((d) => Math.min(30, d + 1))}
                        className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary font-bold" aria-label="Increase days">+</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Budget Slider */}
              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <label className="block text-sm font-bold uppercase tracking-widest text-outline">Budget Range</label>
                  <span className="text-xl font-headline font-extrabold text-primary">
                    {currency} {budgetValue.toLocaleString()}
                  </span>
                </div>
                <div className="relative w-full h-2 bg-primary-fixed rounded-full">
                  <div className="absolute left-0 top-0 h-full bg-linear-to-r from-primary to-primary-container rounded-full"
                    style={{ width: `${budgetPct}%` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-4 border-primary rounded-full shadow-lg pointer-events-none"
                    style={{ left: `calc(${budgetPct}% - 12px)` }} />
                  <input type="range" min={500} max={10000} step={100} value={budgetValue}
                    onChange={(e) => setBudgetValue(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Budget slider" />
                </div>
                <div className="flex justify-between text-[10px] font-bold text-outline uppercase tracking-widest">
                  <span>$500</span><span>$10,000+</span>
                </div>
              </div>

              {/* Trip Style */}
              <div className="space-y-4">
                <label className="block text-sm font-bold uppercase tracking-widest text-outline">Trip Style</label>
                <div className="flex overflow-x-auto gap-2 pb-1 -mx-1 px-1 scrollbar-hide">
                  {TRIP_STYLES.map((s) => (
                    <button key={s.key} onClick={() => setTripStyle(s.key)}
                      className={`flex-none flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                        tripStyle === s.key ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant"
                      }`}>
                      <span>{s.emoji}</span> {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-error/10 border border-error/20 rounded-xl p-4 text-sm text-error font-medium">{error}</div>
              )}

              {/* CTA */}
              <button onClick={handleGenerate} disabled={loading || cities.length === 0} data-testid="web-plan-generate"
                className="w-full bg-linear-to-br from-primary to-primary-container text-on-primary py-5 rounded-full font-headline font-extrabold text-lg flex items-center justify-center gap-3 shadow-lg shadow-primary/20 active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? (
                  <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
                    auto_awesome
                  </span>
                )}
                {loading ? "Building your journey…" : "Generate Magic Itinerary"}
              </button>
            </div>
          </section>

          {/* Trending (mobile) */}
          <section className="px-6 py-10">
            <h2 className="text-2xl font-headline font-bold text-on-surface mb-6">Trending Escapes</h2>
            {popularLoading ? (
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-48 rounded-xl bg-surface-container-high animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {popularCities.slice(0, 4).map((city, idx) => (
                  <button key={city.slug} className="relative h-48 rounded-xl overflow-hidden text-left"
                    onClick={() => addCity(city.slug, getDisplayName(city))}>
                    {city.cover_image ? (
                      <img alt={getDisplayName(city)} className="w-full h-full object-cover" src={city.cover_image} />
                    ) : (
                      <div className={`absolute inset-0 bg-linear-to-br ${GRADIENT_FALLBACKS[idx % GRADIENT_FALLBACKS.length]}`} />
                    )}
                    <div className="absolute inset-0 bg-black/30" />
                    <div className="absolute bottom-3 left-3">
                      <p className="text-white font-bold text-sm">{getDisplayName(city)}</p>
                      <p className="text-white/80 text-[10px] font-bold uppercase tracking-wider">{city.country}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {/* ═══════════════════════ DESKTOP LAYOUT ═══════════════════════ */}
      <div className="hidden md:block pb-0">
        {/* Hero */}
        <section className="relative h-115 w-full overflow-hidden mb-12 bg-primary/10">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary/20 text-[20rem]">travel_explore</span>
          </div>
          <div className="absolute inset-0 bg-linear-to-t from-surface via-surface/20 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end px-8 pb-12 max-w-7xl mx-auto w-full">
            <h1 className="text-5xl md:text-7xl font-extrabold font-headline text-on-surface tracking-tighter mb-4">
              Where to <span className="text-primary">next?</span>
            </h1>
            <p className="text-on-surface-variant text-lg max-w-lg font-medium">
              Define your escape. Our AI digital concierge crafts the perfect itinerary while you dream.
            </p>
          </div>
        </section>

        {/* Content grid */}
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 pb-20">
          {/* Left: Form + Trending */}
          <div className="lg:col-span-7 space-y-8">
            {/* Form card */}
            <div className="bg-surface-container-lowest p-8 rounded-xl shadow-sm space-y-8 relative overflow-hidden">
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
              <div className="space-y-6">
                {/* Destinations with autocomplete (desktop) */}
                <div className="space-y-3 relative" ref={containerRef}>
                  <label className="text-sm font-bold uppercase tracking-widest text-outline">Destinations</label>
                  <div
                    className="flex flex-wrap gap-2 p-4 bg-surface-container-high rounded-lg min-h-14 items-center cursor-text focus-within:ring-2 focus-within:ring-primary/30 transition"
                    onClick={() => inputRef.current?.focus()}
                  >
                    {cities.map((c) => (
                      <div key={c.slug} className="bg-primary-fixed text-on-primary-fixed px-3 py-1 rounded-full flex items-center gap-2 text-sm font-bold">
                        {c.name}
                        <button onClick={(e) => { e.stopPropagation(); removeCity(c.slug); }}
                          className="material-symbols-outlined text-sm leading-none" aria-label={`Remove ${c.name}`}>close</button>
                      </div>
                    ))}
                    <input ref={inputRef}
                      data-testid="web-plan-city-input"
                      className="bg-transparent border-none focus:ring-0 outline-none text-on-surface placeholder:text-outline-variant flex-1 min-w-30 text-sm"
                      placeholder={cities.length === 0 ? "Search city (e.g. Tokyo, Paris, Da Nang)…" : "Add another city…"}
                      value={cityInput}
                      onChange={(e) => { setCityInput(e.target.value); setShowSuggestions(true); }}
                      onFocus={() => cityInput.length >= 2 && setShowSuggestions(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addCityFromInput(); }
                        if (e.key === "Backspace" && !cityInput && cities.length) setCities((p) => p.slice(0, -1));
                        if (e.key === "Escape") setShowSuggestions(false);
                      }}
                      aria-label="Search city" aria-autocomplete="list"
                    />
                  </div>

                  {/* Desktop autocomplete dropdown */}
                  {showSuggestions && cityInput.length >= 2 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-surface-container-highest rounded-xl shadow-xl border border-outline-variant/20 overflow-hidden z-50">
                      {searchLoading && (
                        <div className="px-4 py-3 text-sm text-outline flex items-center gap-2">
                          <svg className="h-4 w-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Searching…
                        </div>
                      )}
                      {!searchLoading && suggestions.length === 0 && (
                        <p className="px-4 py-3 text-sm text-outline">
                          No results — press Enter to add &quot;{cityInput}&quot; anyway
                        </p>
                      )}
                      {suggestions.map((s) => (
                        <button key={s.slug}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-high text-left transition-colors"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addCity(s.slug, s.name["en"] ?? s.slug)}>
                          <span className="material-symbols-outlined text-primary text-base">location_on</span>
                          <span className="font-semibold text-sm">{s.name["en"] ?? s.slug}</span>
                          <span className="ml-auto text-xs font-bold text-outline bg-surface-container px-2 py-0.5 rounded-full">{s.country}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* When + Budget row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <label className="text-sm font-bold uppercase tracking-widest text-outline">When</label>
                      <button onClick={() => setUseDateRange((v) => !v)}
                        className="text-xs text-primary font-bold uppercase tracking-widest">
                        {useDateRange ? "Use days instead" : "Pick dates instead"}
                      </button>
                    </div>
                    {useDateRange ? (
                      <div className="space-y-2">
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                          className="w-full bg-surface-container-high rounded-lg p-3 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-primary/30" />
                        <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
                          className="w-full bg-surface-container-high rounded-lg p-3 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-primary/30" />
                      </div>
                    ) : (
                      <div className="relative flex items-center bg-surface-container-high rounded-lg p-4 gap-4">
                        <span className="material-symbols-outlined text-primary">calendar_month</span>
                        <input type="number" min={1} max={30} value={numDays}
                          onChange={(e) => setNumDays(Math.max(1, Math.min(30, Number(e.target.value))))}
                          className="bg-transparent outline-none font-semibold text-on-surface w-12 text-sm" aria-label="Number of days" />
                        <span className="text-on-surface-variant text-sm">days</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-bold uppercase tracking-widest text-outline">Budget</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1 flex items-center bg-surface-container-high rounded-lg p-4">
                        <span className="material-symbols-outlined text-primary mr-3">payments</span>
                        <input type="number" min={500} max={100000} value={budgetValue}
                          onChange={(e) => setBudgetValue(Number(e.target.value))}
                          className="bg-transparent border-none focus:ring-0 outline-none text-on-surface font-semibold w-full text-sm" aria-label="Budget amount" />
                      </div>
                      <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                        className="bg-surface-container-high rounded-lg px-3 text-sm font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary/30" aria-label="Currency">
                        {["USD", "VND", "EUR", "JPY", "THB", "GBP", "AUD", "SGD"].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Trip Style */}
                <div className="space-y-3">
                  <label className="text-sm font-bold uppercase tracking-widest text-outline">Trip Style</label>
                  <div className="flex flex-wrap gap-2">
                    {TRIP_STYLES.map((s) => (
                      <button key={s.key} onClick={() => setTripStyle(s.key)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                          tripStyle === s.key ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container"
                        }`}>
                        <span>{s.emoji}</span> {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Travelers */}
                <div className="space-y-3">
                  <label className="text-sm font-bold uppercase tracking-widest text-outline">Travelers</label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setNumTravelers((n) => Math.max(1, n - 1))}
                      className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-primary font-bold text-lg" aria-label="Remove traveler">−</button>
                    <span className="text-on-surface font-bold text-lg w-8 text-center">{numTravelers}</span>
                    <button onClick={() => setNumTravelers((n) => Math.min(20, n + 1))}
                      className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-primary font-bold text-lg" aria-label="Add traveler">+</button>
                    <span className="text-on-surface-variant text-sm">{numTravelers === 1 ? "person" : "people"}</span>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-error/10 border border-error/20 rounded-xl p-4 text-sm text-error font-medium">{error}</div>
              )}

              {/* CTA */}
              <button onClick={handleGenerate} disabled={loading || cities.length === 0} data-testid="web-plan-generate"
                className="w-full bg-linear-to-br from-primary to-primary-container text-on-primary font-bold py-5 rounded-full text-lg shadow-xl hover:shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed font-headline">
                {loading ? (
                  <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                {loading ? "Building your journey…" : "Generate Magic Itinerary"}
                {!loading && <span className="material-symbols-outlined">auto_awesome</span>}
              </button>
            </div>

            {/* Trending Escapes bento — fetched from API */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold font-headline tracking-tight">Trending Escapes</h2>
              {popularLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 h-100">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={`rounded-xl bg-surface-container-high animate-pulse ${SPAN_CYCLE[(i - 1) % SPAN_CYCLE.length]}`} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 h-100">
                  {popularCities.slice(0, 4).map((city, idx) => (
                    <button key={city.slug} onClick={() => addCity(city.slug, getDisplayName(city))}
                      className={`relative rounded-xl overflow-hidden group cursor-pointer ${SPAN_CYCLE[idx % SPAN_CYCLE.length]}`}>
                      {city.cover_image ? (
                        <img alt={getDisplayName(city)}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          src={city.cover_image} />
                      ) : (
                        <div className={`absolute inset-0 bg-linear-to-br ${GRADIENT_FALLBACKS[idx % GRADIENT_FALLBACKS.length]}`}>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="material-symbols-outlined text-white/20 text-8xl">travel_explore</span>
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-linear-to-t from-on-surface/80 via-transparent to-transparent" />
                      <div className="absolute bottom-4 left-4 text-left">
                        {city.popular && (
                          <span className="bg-secondary-fixed text-on-secondary-fixed text-[10px] font-black uppercase px-2 py-0.5 rounded-sm mb-1 inline-block">
                            Popular
                          </span>
                        )}
                        <p className="text-white font-bold text-xl font-headline">{getDisplayName(city)}</p>
                        <p className="text-white/70 text-sm">{city.country}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Tips panel */}
          <div className="lg:col-span-5 space-y-8">
            <div className="bg-surface-container-low rounded-xl p-8 sticky top-28 border border-outline-variant/10">
              <h3 className="text-xl font-bold font-headline mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>
                  tips_and_updates
                </span>
                Smart Tips
              </h3>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-primary">flight</span>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface">Mid-week departures</p>
                    <p className="text-sm text-on-surface-variant">Flying on Tuesday or Wednesday typically saves 15–22% on airfare.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-secondary-fixed flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-secondary">savings</span>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface">Book transport early</p>
                    <p className="text-sm text-on-surface-variant">Rail passes and intercity buses booked 30+ days in advance can save up to 40%.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-tertiary-fixed flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-tertiary">schedule</span>
                  </div>
                  <div>
                    <p className="font-bold text-on-surface">Visit early morning</p>
                    <p className="text-sm text-on-surface-variant">Popular attractions have 60% fewer visitors in the first two hours after opening.</p>
                  </div>
                </div>
              </div>

              {cities.length > 0 && (
                <>
                  <hr className="my-8 border-none h-px bg-outline-variant/20" />
                  <div className="space-y-2">
                    <p className="text-sm font-bold text-outline uppercase tracking-widest">Your trip</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {cities.map((c, i) => (
                        <div key={c.slug} className="flex items-center gap-1 text-sm font-bold text-on-surface">
                          {i > 0 && <span className="text-outline">→</span>}
                          <span>{c.name}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-on-surface-variant mt-1">
                      {useDateRange && startDate
                        ? `${startDate}${endDate ? ` → ${endDate}` : ""}`
                        : `${numDays} day${numDays !== 1 ? "s" : ""}`
                      }
                      {" · "}{numTravelers} traveler{numTravelers !== 1 ? "s" : ""}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
