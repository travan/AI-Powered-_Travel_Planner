import type {
  ItineraryOutput,
  CitySuggestion,
  PromptHistoryEntry,
  CreatePlaceSubmissionRequest,
  CreateBillUploadRequest,
  BillUploadSummary,
  TransportMode,
  TransportPriceRecommendationSummary,
  CreateTripActivityRequest,
  CreateTripExpenseRequest,
  GenerateRequest,
  PlaceRecommendationSummary,
  GenerateResponse,
  SearchDraftRecord,
  TripActivitySummary,
  TripChangeRequestSummary,
  TripChecklistItem,
  TripDetail,
  TripSummary,
  UserProfileSummary,
  UserPlaceSubmissionSummary,
} from "@travel/types";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "";

function getApiUrl(path: string) {
  if (!API_URL) return path;
  return `${API_URL.replace(/\/$/, "")}${path}`;
}

export async function generateItinerary(
  body: GenerateRequest,
  authToken?: string
): Promise<GenerateResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(getApiUrl("/api/itinerary/generate"), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Generate failed: ${res.status}`);
  return res.json() as Promise<GenerateResponse>;
}

export async function checkAccountExists(email: string): Promise<boolean | null> {
  const res = await fetch(getApiUrl(`/api/auth/account-exists?email=${encodeURIComponent(email)}`));
  if (!res.ok) return null;
  const payload = (await res.json()) as { exists?: boolean };
  return typeof payload.exists === "boolean" ? payload.exists : null;
}

export async function createSearchDraft(body: {
  guest_key: string;
  email_hint?: string;
  prompt_text?: string;
  search_payload: GenerateRequest;
}): Promise<SearchDraftRecord> {
  const res = await fetch(getApiUrl("/api/search-drafts"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Create search draft failed: ${res.status}`);
  return res.json() as Promise<SearchDraftRecord>;
}

export async function claimSearchDraft(
  draftId: string,
  guestKey: string,
  authToken: string
): Promise<SearchDraftRecord> {
  const res = await fetch(getApiUrl(`/api/search-drafts/${draftId}/claim`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ guest_key: guestKey }),
  });
  if (!res.ok) throw new Error(`Claim search draft failed: ${res.status}`);
  return res.json() as Promise<SearchDraftRecord>;
}

export async function getItinerary(id: string): Promise<ItineraryOutput> {
  const res = await fetch(getApiUrl(`/api/itinerary/${id}`), {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  return res.json() as Promise<ItineraryOutput>;
}

export async function searchCities(q: string): Promise<CitySuggestion[]> {
  const res = await fetch(getApiUrl(`/api/cities/search?q=${encodeURIComponent(q)}`));
  if (!res.ok) return [];
  return res.json() as Promise<CitySuggestion[]>;
}

export async function getPopularCities(): Promise<CitySuggestion[]> {
  const res = await fetch(getApiUrl("/api/cities/popular"), {
    next: { revalidate: 86400 }, // 24h client-side revalidation
  });
  if (!res.ok) return [];
  return res.json() as Promise<CitySuggestion[]>;
}

export async function getPromptHistory(
  authToken: string,
  limit = 5
): Promise<PromptHistoryEntry[]> {
  const res = await fetch(getApiUrl(`/api/users/me/prompt-history?limit=${limit}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) return [];
  return res.json() as Promise<PromptHistoryEntry[]>;
}

export async function getMyProfile(authToken: string): Promise<UserProfileSummary> {
  const res = await fetch(getApiUrl("/api/profile/me"), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
  return res.json() as Promise<UserProfileSummary>;
}

export async function getMyTrips(authToken: string): Promise<TripSummary[]> {
  const res = await fetch(getApiUrl("/api/trips"), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`Trips fetch failed: ${res.status}`);
  return res.json() as Promise<TripSummary[]>;
}

export async function getTripDetail(
  tripId: string,
  authToken: string
): Promise<TripDetail> {
  const res = await fetch(getApiUrl(`/api/trips/${tripId}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`Trip detail fetch failed: ${res.status}`);
  return res.json() as Promise<TripDetail>;
}

export async function updateTripActivityStatus(
  tripId: string,
  activityId: string,
  status: TripActivitySummary["status"],
  authToken: string
): Promise<TripActivitySummary> {
  const res = await fetch(getApiUrl(`/api/trips/${tripId}/activities/${activityId}/status`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Activity update failed: ${res.status}`);
  return res.json() as Promise<TripActivitySummary>;
}

export async function updateTripChecklistStatus(
  tripId: string,
  itemId: string,
  status: TripChecklistItem["status"],
  authToken: string
): Promise<TripChecklistItem> {
  const res = await fetch(getApiUrl(`/api/trips/${tripId}/checklist/${itemId}/status`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Checklist update failed: ${res.status}`);
  return res.json() as Promise<TripChecklistItem>;
}

export async function createTripActivity(
  tripId: string,
  body: CreateTripActivityRequest,
  authToken: string
): Promise<TripActivitySummary> {
  const res = await fetch(getApiUrl(`/api/trips/${tripId}/activities`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Activity create failed: ${res.status}`);
  return res.json() as Promise<TripActivitySummary>;
}

export async function createPlaceSubmission(
  tripId: string,
  body: CreatePlaceSubmissionRequest,
  authToken: string
): Promise<UserPlaceSubmissionSummary> {
  const res = await fetch(getApiUrl(`/api/trips/${tripId}/place-submissions`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Place submission failed: ${res.status}`);
  return res.json() as Promise<UserPlaceSubmissionSummary>;
}

export async function createTripExpense(
  tripId: string,
  body: CreateTripExpenseRequest,
  authToken: string
): Promise<TripDetail["expenses"][number]> {
  const res = await fetch(getApiUrl(`/api/trips/${tripId}/expenses`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Expense create failed: ${res.status}`);
  return res.json() as Promise<TripDetail["expenses"][number]>;
}

export async function createBillUpload(
  tripId: string,
  body: CreateBillUploadRequest,
  authToken: string
): Promise<BillUploadSummary> {
  const res = await fetch(getApiUrl(`/api/trips/${tripId}/bills`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bill upload failed: ${res.status}`);
  return res.json() as Promise<BillUploadSummary>;
}

export async function reviewTripChangeRequest(
  tripId: string,
  requestId: string,
  status: "approved" | "rejected",
  authToken: string
): Promise<TripChangeRequestSummary> {
  const res = await fetch(getApiUrl(`/api/trips/${tripId}/change-requests/${requestId}/review`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Change request review failed: ${res.status}`);
  return res.json() as Promise<TripChangeRequestSummary>;
}

export async function getPlaceRecommendations(params: {
  city_slug?: string | null;
  type?: string;
  limit?: number;
}): Promise<PlaceRecommendationSummary[]> {
  const query = new URLSearchParams();
  if (params.city_slug) query.set("city_slug", params.city_slug);
  if (params.type) query.set("type", params.type);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const res = await fetch(getApiUrl(`/api/recommendations/places${suffix}`));
  if (!res.ok) return [];
  return res.json() as Promise<PlaceRecommendationSummary[]>;
}

export async function getTransportPriceRecommendations(params: {
  mode?: TransportMode;
  from?: string;
  to?: string;
  month?: number;
  limit?: number;
}): Promise<TransportPriceRecommendationSummary[]> {
  const query = new URLSearchParams();
  if (params.mode) query.set("mode", params.mode);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.month) query.set("month", String(params.month));
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const res = await fetch(getApiUrl(`/api/recommendations/transport-prices${suffix}`));
  if (!res.ok) return [];
  return res.json() as Promise<TransportPriceRecommendationSummary[]>;
}

export async function saveTrip(
  itineraryId: string,
  authToken: string
): Promise<void> {
  const res = await fetch(getApiUrl(`/api/itinerary/${itineraryId}/save`), {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
}

export async function shareItinerary(
  itineraryId: string,
  authToken: string
): Promise<{ share_token: string; share_url: string }> {
  const res = await fetch(getApiUrl(`/api/itinerary/${itineraryId}/share`), {
    method: "PATCH",
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) throw new Error(`Share failed: ${res.status}`);
  return res.json() as Promise<{ share_token: string; share_url: string }>;
}
