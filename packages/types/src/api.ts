import type { ItineraryInput, ItineraryStatus, SSEEventType, ItineraryOverview } from "./itinerary";

// ─── Generate ─────────────────────────────────────────────────────────────────

export interface GenerateRequest extends ItineraryInput {}

export interface GenerateResponse {
  job_id: string;
  status: "queued" | "cached";
  stream_url: string;
  estimated_wait_seconds?: number;
  result?: unknown; // present when status === "cached"
}

// ─── SSE Events ───────────────────────────────────────────────────────────────

export interface SSEEvent<T = unknown> {
  event: SSEEventType;
  data: T;
}

export interface SSEQueuedData {
  status: "queued";
  position: number;
}

export interface SSEProcessingData {
  status: "processing";
  step: string;
}

export interface SSECityReadyData {
  city: string;
  days: unknown[];
}

export interface SSECompleteData {
  itinerary_id: string;
  status: ItineraryStatus;
}

export interface SSEErrorData {
  message: string;
  code: string;
}

// ─── Saved Itinerary (DB row) ─────────────────────────────────────────────────

export interface ItineraryRecord {
  id: string;
  user_id?: string;
  job_id?: string;
  cities: string[];
  countries: string[];
  start_date?: string;
  end_date?: string;
  num_days: number;
  budget?: number;
  currency: string;
  trip_style: string;
  status: ItineraryStatus;
  result?: unknown;
  is_public: boolean;
  share_token?: string;
  created_at: string;
}

// ─── City Search ──────────────────────────────────────────────────────────────

export interface CitySearchResult {
  slug: string;
  name: string;
  country: string;
  country_flag?: string;
}

// ─── API Error ────────────────────────────────────────────────────────────────

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

// ─── Overview (Phase 1 AI output) ────────────────────────────────────────────

export type { ItineraryOverview };
