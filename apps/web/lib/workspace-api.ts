import { fetchWithLocalSession } from "./session-fetch";
import type { TripRole } from "@travel/types";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "";

export type TripMemberRole = TripRole;
export type TripMemberStatus = "invited" | "active" | "removed";

export type TripMember = {
  tripId: string;
  userId: string;
  displayName?: string | null;
  email?: string | null;
  role: TripMemberRole;
  status: TripMemberStatus;
  invitedByUserId: string | null;
  invitedByDisplayName?: string | null;
  invitedByEmail?: string | null;
  joinedAt: string;
};

export type TripInvite = {
  emailStatus?:
    | "not_requested"
    | "not_configured"
    | "queued"
    | "sent"
    | "failed"
    | "cancelled";
  sentAt?: string | null;
  id: string;
  tripId: string;
  invitedByUserId: string;
  email: string | null;
  role: TripMemberRole;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string | null;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  createdAt: string;
};

export type TripShareLink = {
  tripId: string;
  enabled: boolean;
  shareToken: string | null;
  role: TripMemberRole;
};

export type TripAuditLog = {
  id: string;
  tripId: string | null;
  actorUserId: string | null;
  entityType: string;
  entityId: string | null;
  action: string;
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
  createdAt: string;
};

export type ActivityCatalogItem = {
  id: string;
  canonicalName: string;
  category: string;
  citySlug: string | null;
  address: string | null;
  source: string;
  qualityScore: number;
  isOutdated: boolean;
  lastVerifiedAt: string | null;
};

export type TripActivityParticipant = {
  activityId: string;
  userId: string;
  status: "joined" | "declined" | "maybe";
  joinedAt: string;
};

export type TripActivity = {
  sourcePlanItemId?: string;
  id: string;
  tripId: string;
  activityCatalogId: string | null;
  title: string;
  category: string;
  scheduledAt: string | null;
  locationName: string | null;
  address: string | null;
  estimatedCost: number | null;
  currency: string;
  createdByUserId: string;
  updatedByUserId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  participants: TripActivityParticipant[];
};

export type CreateTripActivityInput = {
  source_plan_item_id?: string;
  activity_catalog_id?: string;
  title: string;
  category?: string;
  scheduled_at?: string;
  location_name?: string;
  address?: string;
  estimated_cost?: number;
  currency?: string;
};

export type TransportMode =
  | "flight"
  | "train"
  | "bus"
  | "ferry"
  | "car"
  | "motorbike"
  | "bicycle"
  | "walking"
  | "other";

export type TransportBooking = {
  id: string;
  tripId: string;
  activityId: string | null;
  mode: TransportMode;
  providerName: string | null;
  bookingReference: string | null;
  originName: string;
  destinationName: string;
  departureAt: string | null;
  arrivalAt: string | null;
  price: number | null;
  currency: string;
  bookingStatus: string;
  notes: string | null;
  createdByUserId: string;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  participantUserIds: string[];
};

export type CreateTransportBookingInput = {
  activity_id?: string;
  mode: TransportMode;
  provider_name?: string;
  booking_reference?: string;
  origin_name: string;
  destination_name: string;
  departure_at?: string;
  arrival_at?: string;
  price?: number;
  currency?: string;
  booking_status?: string;
  notes?: string;
  participant_user_ids?: string[];
};

export type BillUpload = {
  id: string;
  tripId: string;
  activityId: string | null;
  uploadedByUserId: string;
  status: string;
  storageUrl: string | null;
  rawText: string | null;
  totalAmount: number | null;
  currency: string;
  merchantName: string | null;
  billIssuedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateBillInput = {
  activity_id?: string;
  storage_url?: string;
  raw_text?: string;
  total_amount?: number;
  currency?: string;
  merchant_name?: string;
  bill_issued_at?: string;
};

export type ExpenseSplitStatus = "owed" | "settled" | "waived";

export type ExpenseSplit = {
  id: string;
  expenseId: string;
  activityId: string | null;
  userId: string;
  amount: number;
  status: ExpenseSplitStatus;
  settledAt: string | null;
};

export type Expense = {
  expenseType?: string;
  id: string;
  tripId: string;
  activityId: string | null;
  billUploadId: string | null;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  paidByUserId: string;
  createdByUserId: string;
  updatedByUserId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  splits: ExpenseSplit[];
};

export type ReviewEntityType = "activity" | "bill" | "expense" | "place_signal";

export type ReviewQueueItem = {
  id: string;
  entityType: ReviewEntityType;
  entityId: string;
  title: string;
  subtitle: string | null;
  status: string;
  submittedByUserId: string | null;
  amount: number | null;
  currency: string | null;
  linkedActivityId: string | null;
  createdAt: string;
};

export type BillNormalizationResult = {
  bill: BillUpload;
  extracted: {
    merchantName: string | null;
    totalAmount: number | null;
    currency: string;
    issuedAt: string | null;
    lineItems: Array<{ name: string; amount: number; category: string | null }>;
  };
  suggestedExpense: {
    title: string;
    amount: number | null;
    currency: string;
    activityId: string | null;
    splitStrategy: "equal";
  };
  placeSignal: {
    canonicalName: string | null;
    address: string | null;
    category: string;
    confidence: number;
    action: "create_candidate" | "update_existing" | "mark_outdated";
    reason: string;
  };
};

export type PlaceRecommendation = {
  id: string;
  name: string;
  category: string;
  citySlug: string | null;
  address: string | null;
  priceLevel: string | null;
  qualityScore: number;
  lastVerifiedAt: string | null;
};

export type TransportPriceRecommendation = {
  id: string;
  mode: TransportMode;
  providerName: string | null;
  originCity: string | null;
  destinationCity: string | null;
  currency: string;
  minPrice: number | null;
  medianPrice: number | null;
  bestObservedAt: string | null;
};

export type DataQualitySignal = {
  id: string;
  signalType:
    | "price_change"
    | "duplicate_place"
    | "renamed_place"
    | "moved_place"
    | "outdated_place";
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
  entityType: string;
  entityId: string | null;
  status: "open" | "reviewed";
};

export type CreateExpenseInput = {
  expense_type?: string;
  title: string;
  description?: string;
  amount: number;
  currency?: string;
  paid_by_user_id?: string;
  activity_id?: string;
  bill_upload_id?: string;
  split_strategy: "equal" | "custom";
  participant_user_ids?: string[];
  splits?: Array<{ user_id: string; amount: number }>;
};

export class WorkspaceApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "WorkspaceApiError";
  }
}

type RequestOptions = {
  authToken: string;
  body?: unknown;
  method?: "GET" | "POST" | "PATCH";
};

function getApiUrl(path: string) {
  if (!API_URL) return path;
  return `${API_URL.replace(/\/$/, "")}${path}`;
}

async function requestJson<T>(
  path: string,
  options: RequestOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.authToken}`,
  };

  if (options.body) headers["Content-Type"] = "application/json";

  const res = await fetchWithLocalSession(getApiUrl(path), {
    cache: "no-store",
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    let message = `Workspace request failed: ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      message = body.message ?? message;
    } catch {
      // Keep the generic status message when the response is not JSON.
    }
    throw new WorkspaceApiError(message, res.status);
  }

  if (options.method && options.method !== "GET")
    window.dispatchEvent(new Event("cohorizon:job-status"));
  return res.json() as Promise<T>;
}

export function getTripWorkspace(tripId: string, authToken: string) {
  return requestJson<{
    membership: TripMember;
    members: TripMember[];
    title?: string;
    primaryCitySlug: string | null;
  }>(`/api/trips/${tripId}/workspace`, { authToken });
}

export function listTripMembers(tripId: string, authToken: string) {
  return requestJson<TripMember[]>(`/api/trips/${tripId}/members`, {
    authToken,
  });
}

export function getTripMembership(tripId: string, authToken: string) {
  return requestJson<TripMember>(`/api/trips/${tripId}/membership`, {
    authToken,
  });
}

export function createTripInvite(
  tripId: string,
  authToken: string,
  body: { email?: string; role: TripMemberRole; expiresInDays?: number },
) {
  return requestJson<TripInvite>(`/api/trips/${tripId}/invites`, {
    authToken,
    method: "POST",
    body,
  });
}

export function tripInviteDelivery(
  tripId: string,
  inviteId: string,
  authToken: string,
  resend = false,
) {
  return requestJson<Pick<TripInvite, "emailStatus" | "sentAt">>(
    `/api/trips/${tripId}/invites/${inviteId}/${resend ? "resend" : "delivery"}`,
    { authToken, method: resend ? "POST" : "GET" },
  );
}

export function updateTripShareLink(
  tripId: string,
  authToken: string,
  body: { enabled: boolean; role: TripMemberRole },
) {
  return requestJson<TripShareLink>(`/api/trips/${tripId}/share-link`, {
    authToken,
    method: "PATCH",
    body,
  });
}

export function updateTripMember(
  tripId: string,
  userId: string,
  authToken: string,
  body: { role?: TripMemberRole; status?: TripMemberStatus },
) {
  return requestJson<TripMember>(`/api/trips/${tripId}/members/${userId}`, {
    authToken,
    method: "PATCH",
    body,
  });
}

export function joinTripByInviteToken(authToken: string, token: string) {
  return requestJson<TripMember>("/api/trips/join/invite", {
    authToken,
    method: "POST",
    body: { token },
  });
}

export function joinTripByShareToken(authToken: string, token: string) {
  return requestJson<TripMember>("/api/trips/join/share-link", {
    authToken,
    method: "POST",
    body: { token },
  });
}

export function listTripAuditLogs(
  tripId: string,
  authToken: string,
  limit = 10,
) {
  return requestJson<TripAuditLog[]>(
    `/api/trips/${tripId}/audit-logs?limit=${limit}`,
    { authToken },
  );
}

export function searchActivityCatalog(
  query: {
    citySlug?: string;
    category?: string;
    q?: string;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams();
  if (query.citySlug) params.set("citySlug", query.citySlug);
  if (query.category) params.set("category", query.category);
  if (query.q) params.set("q", query.q);
  if (query.limit) params.set("limit", String(query.limit));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return fetch(getApiUrl(`/api/activities/catalog${suffix}`)).then((res) => {
    if (!res.ok) return [] as ActivityCatalogItem[];
    return res.json() as Promise<ActivityCatalogItem[]>;
  });
}

export function listTripActivities(tripId: string, authToken: string) {
  return requestJson<TripActivity[]>(`/api/trips/${tripId}/activities`, {
    authToken,
  });
}

export function createTripActivity(
  tripId: string,
  authToken: string,
  body: CreateTripActivityInput,
) {
  return requestJson<TripActivity>(`/api/trips/${tripId}/activities`, {
    authToken,
    method: "POST",
    body,
  });
}

export function updateTripActivity(
  tripId: string,
  activityId: string,
  authToken: string,
  body: Partial<CreateTripActivityInput> & { status?: string },
) {
  return requestJson<TripActivity>(
    `/api/trips/${tripId}/activities/${activityId}`,
    {
      authToken,
      method: "PATCH",
      body,
    },
  );
}

export function updateActivityParticipant(
  tripId: string,
  activityId: string,
  userId: string,
  authToken: string,
  status: TripActivityParticipant["status"],
) {
  return requestJson<TripActivityParticipant>(
    `/api/trips/${tripId}/activities/${activityId}/participants/${userId}`,
    {
      authToken,
      method: "PATCH",
      body: { status },
    },
  );
}

export function listTransportBookings(tripId: string, authToken: string) {
  return requestJson<TransportBooking[]>(
    `/api/trips/${tripId}/transport-bookings`,
    { authToken },
  );
}

export function createTransportBooking(
  tripId: string,
  authToken: string,
  body: CreateTransportBookingInput,
) {
  return requestJson<TransportBooking>(
    `/api/trips/${tripId}/transport-bookings`,
    {
      authToken,
      method: "POST",
      body,
    },
  );
}

export function updateTransportBooking(
  tripId: string,
  bookingId: string,
  authToken: string,
  body: Partial<CreateTransportBookingInput>,
) {
  return requestJson<TransportBooking>(
    `/api/trips/${tripId}/transport-bookings/${bookingId}`,
    {
      authToken,
      method: "PATCH",
      body,
    },
  );
}

export function createBillUpload(
  tripId: string,
  authToken: string,
  body: CreateBillInput,
) {
  return requestJson<BillUpload>(`/api/trips/${tripId}/bills`, {
    authToken,
    method: "POST",
    body,
  });
}

export function updateBillUpload(
  billId: string,
  authToken: string,
  body: Partial<CreateBillInput> & { status?: string },
) {
  return requestJson<BillUpload>(`/api/bills/${billId}`, {
    authToken,
    method: "PATCH",
    body,
  });
}

export function listExpenses(tripId: string, authToken: string) {
  return requestJson<Expense[]>(`/api/trips/${tripId}/expenses`, { authToken });
}

export function createExpense(
  tripId: string,
  authToken: string,
  body: CreateExpenseInput,
) {
  return requestJson<Expense>(`/api/trips/${tripId}/expenses`, {
    authToken,
    method: "POST",
    body,
  });
}

export function updateExpense(
  tripId: string,
  expenseId: string,
  authToken: string,
  body: Partial<CreateExpenseInput> & { status?: string },
) {
  return requestJson<Expense>(`/api/trips/${tripId}/expenses/${expenseId}`, {
    authToken,
    method: "PATCH",
    body,
  });
}

export function updateExpenseSplitStatus(
  tripId: string,
  expenseId: string,
  splitId: string,
  authToken: string,
  status: ExpenseSplitStatus,
) {
  return requestJson<ExpenseSplit>(
    `/api/trips/${tripId}/expenses/${expenseId}/splits/${splitId}`,
    {
      authToken,
      method: "PATCH",
      body: { status },
    },
  );
}

export function listReviewQueue(tripId: string, authToken: string) {
  return requestJson<ReviewQueueItem[]>(`/api/trips/${tripId}/review-queue`, {
    authToken,
  });
}

export function reviewSubmission(
  tripId: string,
  authToken: string,
  body: {
    entity_type: ReviewEntityType;
    entity_id: string;
    decision: "approved" | "rejected";
    notes?: string;
  },
) {
  return requestJson<ReviewQueueItem[]>(
    `/api/trips/${tripId}/review-submissions`,
    {
      authToken,
      method: "PATCH",
      body,
    },
  );
}

export function analyzeBillUpload(billId: string, authToken: string) {
  return requestJson<BillNormalizationResult>(`/api/bills/${billId}/analyze`, {
    authToken,
    method: "POST",
  });
}

export function listPlaceRecommendations(
  query: { citySlug?: string; category?: string; limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (query.citySlug) params.set("citySlug", query.citySlug);
  if (query.category) params.set("category", query.category);
  if (query.limit) params.set("limit", String(query.limit));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return fetch(getApiUrl(`/api/recommendations/places${suffix}`)).then(
    (res) => {
      if (!res.ok) return [] as PlaceRecommendation[];
      return res.json() as Promise<PlaceRecommendation[]>;
    },
  );
}

export function listTransportPriceRecommendations(
  query: {
    mode?: TransportMode;
    originCity?: string;
    destinationCity?: string;
    limit?: number;
  } = {},
) {
  const params = new URLSearchParams();
  if (query.mode) params.set("mode", query.mode);
  if (query.originCity) params.set("originCity", query.originCity);
  if (query.destinationCity)
    params.set("destinationCity", query.destinationCity);
  if (query.limit) params.set("limit", String(query.limit));

  const suffix = params.toString() ? `?${params.toString()}` : "";
  return fetch(
    getApiUrl(`/api/recommendations/transport-prices${suffix}`),
  ).then((res) => {
    if (!res.ok) return [] as TransportPriceRecommendation[];
    return res.json() as Promise<TransportPriceRecommendation[]>;
  });
}

export function listDataQualitySignals(tripId: string, authToken: string) {
  return requestJson<DataQualitySignal[]>(
    `/api/trips/${tripId}/data-quality-signals`,
    { authToken },
  );
}
