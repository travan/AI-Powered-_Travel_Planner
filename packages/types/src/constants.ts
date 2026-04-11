// ─── Trip Styles ─────────────────────────────────────────────────────────────
// Single source of truth — used by web, mobile, and API validation

export const TRIP_STYLES = [
  { key: "budget",    label: "Budget",    emoji: "💰" },
  { key: "mid_range", label: "Mid-range", emoji: "🏨" },
  { key: "luxury",    label: "Luxury",    emoji: "✨" },
  { key: "adventure", label: "Adventure", emoji: "🧗" },
  { key: "family",    label: "Family",    emoji: "👨‍👩‍👧" },
  { key: "romantic",  label: "Romantic",  emoji: "💑" },
  { key: "cultural",  label: "Cultural",  emoji: "🏛️" },
] as const;

export type TripStyleKey = typeof TRIP_STYLES[number]["key"];

// ─── City search result (lightweight, for autocomplete + trending) ─────────────

export interface CitySuggestion {
  slug: string;
  name: Record<string, string>;
  country: string;
  popular?: boolean;
  cover_image?: string;
}

// ─── Prompt history entry (returned from GET /api/users/me/prompt-history) ─────

export interface PromptHistoryEntry {
  id: string;
  cities: string[];
  city_names: string[];
  num_days: number;
  budget?: number;
  currency: string;
  trip_style: TripStyleKey;
  created_at: string;
  itinerary_id?: string;
}
