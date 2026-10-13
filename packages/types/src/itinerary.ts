// ─── Enums ────────────────────────────────────────────────────────────────────

export type TripStyle =
  | "adventure"
  | "relax"
  | "culture"
  | "food"
  | "mixed"
  | "budget"
  | "mid_range"
  | "luxury"
  | "family"
  | "romantic"
  | "cultural";
export type ActivityCategory =
  | "attraction"
  | "food"
  | "transport"
  | "accommodation"
  | "leisure"
  | "shopping";
export type TransportMode =
  | "train"
  | "flight"
  | "bus"
  | "car"
  | "self_drive"
  | "taxi"
  | "motorbike"
  | "bicycle"
  | "boat"
  | "ferry"
  | "cruise"
  | "walk"
  | "other";
export type TransportType =
  | "train"
  | "flight"
  | "bus"
  | "car_rental"
  | "self_drive"
  | "motorbike_rental"
  | "taxi"
  | "bicycle"
  | "boat"
  | "ferry"
  | "cruise"
  | "walk"
  | "other";
export type TicketPlatform =
  | "Klook"
  | "Traveloka"
  | "Trip.com"
  | "GetYourGuide"
  | "Viator"
  | "Official"
  | string;
export type SuggestionType = "tour" | "activity" | "experience" | "transport" | "combo";
export type GoldenMomentType =
  | "sunrise"
  | "sunset"
  | "golden_hour"
  | "blue_hour"
  | "night_view"
  | "crowd_avoid";
export type ItineraryStatus = "generating" | "complete" | "failed";
export type SSEEventType =
  | "queued"
  | "processing"
  | "overview_ready"
  | "city_ready"
  | "transport_ready"
  | "restaurants_ready"
  | "complete"
  | "error";

// ─── Ticket & Suggestion ──────────────────────────────────────────────────────

export interface TicketOption {
  platform: TicketPlatform;
  url: string;
  price_from?: string;
  note?: string;
}

export interface Suggestion {
  name: string;
  description?: string;
  type: SuggestionType;
  platform: TicketPlatform;
  url: string;
  price_from?: string;
  duration?: string;
  note?: string;
}

// ─── Golden Moment ────────────────────────────────────────────────────────────

export interface GoldenMoment {
  type: GoldenMomentType;
  best_time: string;
  tip: string;
}

// ─── Transport ────────────────────────────────────────────────────────────────

export interface TransportOption {
  provider: string;
  type: TransportType;
  departure?: string;
  arrival?: string;
  duration?: string;
  price_range: string;
  booking_url: string;
  note?: string;
}

export interface TransportSegment {
  segment: string;
  from: string;
  to: string;
  recommended_mode: TransportMode;
  options: TransportOption[];
}

// ─── Activity ─────────────────────────────────────────────────────────────────

export interface Activity {
  time: string;
  name: string;
  description: string;
  duration: string;
  cost: number | null;
  currency: string;
  category: ActivityCategory;
  maps_link: string;
  booking_link?: string;
  ticket_activities?: TicketOption[];
  golden_moment?: GoldenMoment;
}

// ─── Day ──────────────────────────────────────────────────────────────────────

export interface ItineraryDay {
  day_number: number;
  date: string;
  city: string;
  title: string;
  transport?: TransportSegment;
  activities: Activity[];
  daily_cost_estimate: number;
}

// ─── Hotels & Restaurants ─────────────────────────────────────────────────────

export interface Hotel {
  name: string;
  stars?: number;
  price_per_night: string;
  price_range: string;
  booking_url: string;
  airbnb_url: string;
  address: string;
  maps_link: string;
  note?: string;
}

export interface Restaurant {
  name: string;
  cuisine: string;
  price_range: string;
  price_per_person?: string;
  address: string;
  maps_link: string;
  tiktok_search_link: string;
  ig_search_link: string;
  note?: string;
  golden_moment?: Pick<GoldenMoment, "best_time" | "tip">;
}

// ─── Seasonal Notes ───────────────────────────────────────────────────────────

export interface SeasonalNotes {
  travel_month: string;
  daylight_hours: string;
  sunrise_time: string;
  sunset_time: string;
  weather_note: string;
  highlights: string[];
  warnings: string[];
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export interface BudgetBreakdown {
  accommodation: number;
  food: number;
  activities: number;
  transport: number;
  contingency: number;
  total: number;
  currency: string;
  per_person: number;
  per_day: number;
}

// ─── Itinerary ────────────────────────────────────────────────────────────────

export interface Itinerary {
  id?: string;
  title: string;
  overview: string;
  total_cost: number;
  currency: string;
  num_days: number;
  num_travelers: number;
  seasonal_notes: SeasonalNotes;
  transport_summary: TransportSegment[];
  days: ItineraryDay[];
  hotels: Hotel[];
  restaurants: Restaurant[];
  suggestions: Suggestion[];
  budget_breakdown: BudgetBreakdown;
}

export interface ItineraryOverview {
  title: string;
  overview: string;
  cities: string[];
  total_days: number;
  estimated_budget: {
    min: number;
    max: number;
    currency: string;
  };
  day_plan: string[];
}

export interface ItineraryOutput {
  itineraries: Itinerary[];
}

// ─── Input ────────────────────────────────────────────────────────────────────

export interface ItineraryInput {
  cities: string[];
  prompt_text?: string;
  start_date?: string;
  end_date?: string;
  num_days?: number;
  budget?: number;
  currency: string;
  trip_style: TripStyle;
  locale: string;
  num_travelers: number;
}
