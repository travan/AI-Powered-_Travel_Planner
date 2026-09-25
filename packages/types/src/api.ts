import type { ItineraryInput, ItineraryStatus, SSEEventType, ItineraryOverview, TripStyle, TransportMode } from "./itinerary";
import type { TripStyleKey } from "./constants";

// ─── Generate ─────────────────────────────────────────────────────────────────

export interface GenerateRequest extends Omit<ItineraryInput, "trip_style"> {
  trip_style: TripStyle | TripStyleKey;
  city_names?: string[];
  prompt_text?: string;
}

export interface QueuedGenerateResponse {
  job_id: string;
  status: "queued";
  stream_url: string;
  estimated_wait_seconds?: number;
}

export interface CachedGenerateResponse {
  status: "cached";
  itinerary_id?: string;
  result?: unknown; // present when status === "cached"
}

export interface UnsupportedGenerateResponse {
  status: "unsupported";
  code: "UNSUPPORTED_DESTINATION" | "NO_ITINERARY" | "AI_UNAVAILABLE";
  message: string;
  unsupported_cities?: string[];
}

export type GenerateResponse =
  | QueuedGenerateResponse
  | CachedGenerateResponse
  | UnsupportedGenerateResponse;

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

// ─── Search Drafts ────────────────────────────────────────────────────────────

export interface SearchDraftRecord {
  id: string;
  user_id: string | null;
  guest_key: string | null;
  email_hint: string | null;
  prompt_text: string | null;
  search_payload: GenerateRequest;
  status: "pending" | "claimed" | "discarded";
  created_at: string;
}

// ─── Trip Management ─────────────────────────────────────────────────────────

export interface UserProfileSummary {
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  home_city_slug: string | null;
  travel_preferences: Record<string, unknown>;
}

export interface TripSummary {
  id: string;
  title: string;
  description: string | null;
  primary_city_slug: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  visibility: string;
  budget: number | null;
  currency: string;
  role: "host" | "co_host" | "contributor" | "viewer";
  member_count: number;
  activity_count: number;
  checklist_done: number;
  checklist_total: number;
  expense_total: number;
  created_at: string;
}

export interface TripMemberSummary {
  user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
}

export interface TripDaySummary {
  id: string;
  day_index: number;
  date: string | null;
  title: string | null;
}

export interface TripActivitySummary {
  id: string;
  trip_day_id: string | null;
  title: string;
  status: string;
  approval_status: string;
  place_name: string | null;
  start_time: string | null;
  end_time: string | null;
  price_snapshot: number | null;
  created_by_user_id: string | null;
}

export interface CreateTripActivityRequest {
  title: string;
  notes?: string;
  trip_day_id?: string | null;
  place_id?: string | null;
  place_name?: string;
  address?: string;
  price?: number;
  start_time?: string | null;
  end_time?: string | null;
}

export interface TripChecklistItem {
  id: string;
  title: string;
  category: string;
  status: "todo" | "in_progress" | "done" | "blocked";
  due_date: string | null;
  assigned_to_user_id: string | null;
}

export interface TripAccommodationSummary {
  id: string;
  place_name: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  room_type: string | null;
  total_price: number | null;
  currency: string;
  booking_status: string;
}

export interface TripTransportSummary {
  id: string;
  mode: TransportMode;
  provider_name: string | null;
  service_number: string | null;
  from_label: string | null;
  to_label: string | null;
  departure_time: string | null;
  arrival_time: string | null;
  service_class: string;
  status: string;
}

export interface ExpenseSplitSummary {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  share_amount: number;
  share_percent: number | null;
  status: "pending" | "settled" | "waived";
}

export interface TripExpenseSummary {
  id: string;
  title: string;
  amount: number;
  currency: string;
  expense_type: string;
  approval_status: string;
  paid_by_email: string | null;
  place_name: string | null;
  activity_title: string | null;
  activity_id: string | null;
  place_id: string | null;
  created_by_user_id: string | null;
  splits: ExpenseSplitSummary[];
}

export interface CreateTripExpenseRequest {
  title: string;
  amount: number;
  currency?: string;
  expense_type?: "accommodation" | "food" | "activity" | "transport" | "shopping" | "other";
  activity_id?: string | null;
  place_id?: string | null;
  split_user_ids?: string[];
}

export interface TripChangeRequestSummary {
  id: string;
  target_type: string;
  target_id: string;
  requested_by_user_id: string;
  requested_by_email: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  change_payload: Record<string, unknown>;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface ReviewTripChangeRequestRequest {
  status: "approved" | "rejected";
}

export interface UserPlaceSubmissionSummary {
  id: string;
  raw_name: string;
  raw_type: string | null;
  raw_address: string | null;
  raw_notes: string | null;
  raw_price: number | null;
  status: "pending" | "normalized" | "duplicate" | "rejected";
  created_at: string;
}

export interface CreatePlaceSubmissionRequest {
  raw_name: string;
  raw_type?: string;
  raw_address?: string;
  raw_notes?: string;
  raw_price?: number;
  activity_id?: string | null;
}

export interface TripAuditLogSummary {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_display_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface BillLineItemSummary {
  id: string;
  name: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number;
  category: string | null;
  confidence_score: number;
}

export interface BillUploadSummary {
  id: string;
  trip_id: string;
  uploaded_by_user_id: string;
  place_id: string | null;
  activity_id: string | null;
  storage_url: string;
  status: "uploaded" | "processing" | "parsed" | "needs_review" | "confirmed";
  total_amount: number | null;
  currency: string;
  bill_date: string | null;
  expense_id: string | null;
  created_at: string;
  line_items: BillLineItemSummary[];
}

export interface CreateBillUploadRequest {
  raw_ocr_text: string;
  storage_url?: string;
  place_id?: string | null;
  activity_id?: string | null;
  place_name?: string;
  place_address?: string;
  place_type?: "hotel" | "homestay" | "cafe" | "restaurant" | "attraction" | "activity" | "transport_hub" | "shop" | "other";
  city_slug?: string;
  total_amount?: number;
  currency?: string;
  bill_date?: string;
  create_expense?: boolean;
  split_user_ids?: string[];
}

export interface PlaceRecommendationSummary {
  id: string;
  city_slug: string | null;
  current_name: string;
  type: string;
  category: string | null;
  normalized_address: string | null;
  average_rating: number | null;
  quality_score: number;
  freshness_score: number;
  status: string;
  latest_price: number | null;
  latest_price_type: string | null;
  latest_price_observed_at: string | null;
  pending_signal_count: number;
  recommendation_score: number;
  data_quality_label: "fresh" | "watch_price" | "needs_review" | "outdated";
}

export interface TransportPriceRecommendationSummary {
  id: string;
  mode: TransportMode;
  from_hub_code: string | null;
  to_hub_code: string | null;
  from_label: string | null;
  to_label: string | null;
  provider_name: string | null;
  service_class: string;
  month: number | null;
  cheapest_observed_price: number | null;
  average_price: number | null;
  expensive_threshold: number | null;
  cheap_window_start: number | null;
  cheap_window_end: number | null;
  recommendation: string | null;
  confidence_score: number;
  updated_at: string;
}

export interface TripDetail extends TripSummary {
  members: TripMemberSummary[];
  days: TripDaySummary[];
  activities: TripActivitySummary[];
  checklist: TripChecklistItem[];
  accommodations: TripAccommodationSummary[];
  transports: TripTransportSummary[];
  expenses: TripExpenseSummary[];
  change_requests: TripChangeRequestSummary[];
  place_submissions: UserPlaceSubmissionSummary[];
  audit_logs: TripAuditLogSummary[];
}
