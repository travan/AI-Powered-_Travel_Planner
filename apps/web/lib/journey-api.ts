import { fetchWithLocalSession } from "./session-fetch";
import { resolveApiUrl } from "@travel/api-client";
import type {
  AccommodationBooking,
  GenerateRequest,
  Itinerary,
  PlanningIssue,
  PlanningJob,
  PlanningJobSummary,
  PlanRevision,
} from "@travel/types";
import { ApiRequestError } from "./api";

export async function journeyRequest<T>(
  path: string,
  token?: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  signal?: AbortSignal,
  cache: RequestCache = "no-store",
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetchWithLocalSession(
    resolveApiUrl(`/api/${path}`, {
      publicBaseUrl: process.env["NEXT_PUBLIC_API_URL"] ?? "",
    }),
    {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
      cache,
    },
  ).catch((error: unknown) => {
    if (
      path !== "planning/validate" ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw error;
    throw new ApiRequestError(
      "Planning service unavailable",
      0,
      "PLANNER_API_UNAVAILABLE",
    );
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    const retryAfter = response.headers.get("Retry-After");
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const retryAfterMs = Number.isFinite(seconds) ? seconds * 1000
      : retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
    throw new ApiRequestError(
      typeof detail?.message === "string"
        ? detail.message
        : `Yêu cầu thất bại (${response.status}).`,
      response.status,
      path === "planning/validate" && response.status >= 500
        ? "PLANNER_API_UNAVAILABLE"
        : typeof detail?.code === "string"
          ? detail.code
          : undefined,
      detail?.params,
      retryAfterMs > 0 ? retryAfterMs : undefined,
    );
  }
  if (typeof window !== "undefined" && method !== "GET" &&
      /^(?:trips\/[^/]+\/|itinerary\/[^/]+\/translations)/.test(path))
    window.dispatchEvent(new Event("cohorizon:job-status"));
  return response.json() as Promise<T>;
}
export const validateJourney = (request: GenerateRequest) =>
  journeyRequest<{ valid: boolean; issues: PlanningIssue[] }>(
    "planning/validate",
    undefined,
    request,
  );
export const getPlanningRequests = (token: string, signal?: AbortSignal) =>
  journeyRequest<PlanningJobSummary[]>(
    "planning/requests",
    token,
    undefined,
    "GET",
    signal,
  );
const pendingJobs = new Map<string, Promise<PlanningJob>>();

export function getJourneyJob(id: string, token: string, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const key = `${id}:${token}`;
  const pending = pendingJobs.get(key);
  if (pending) return pending;
  const request = journeyRequest<PlanningJob>(`itinerary/jobs/${id}`, token).finally(() => {
    pendingJobs.delete(key);
  });
  pendingJobs.set(key, request);
  return request;
}

export const retryJourneyJob = (id: string, token: string, key: string) =>
  journeyRequest<{ job_id: string }>(`itinerary/jobs/${id}/retry`, token, undefined, "POST", undefined, "no-store", key);

export const getPlanningStatuses = (ids: string[], token: string, signal: AbortSignal) =>
  journeyRequest<PlanningJob[]>(`planning/statuses?ids=${ids.join(",")}`, token, undefined, "GET", signal);

export const notifyJobStatusChanged = () => window.dispatchEvent(new Event("cohorizon:job-status"));
export const getJourneyPlan = (tripId: string, token: string) =>
  journeyRequest<Itinerary>(`trips/${tripId}/planning`, token);
export const getAccommodations = (tripId: string, token: string) =>
  journeyRequest<AccommodationBooking[]>(
    `trips/${tripId}/accommodations`,
    token,
  );
export const getPlanRevisions = (tripId: string, token: string) =>
  journeyRequest<PlanRevision[]>(`trips/${tripId}/itinerary-revisions`, token);
export interface LocationCandidate {
  id: string;
  label: string;
  city_slug: string;
  latitude: number | null;
  longitude: number | null;
  kind: string;
  distance_km: number | null;
}
export const resolveJourneyLocation = (input: {
  query?: string;
  latitude?: number;
  longitude?: number;
}) =>
  journeyRequest<{ candidates: LocationCandidate[] }>(
    "locations/resolve",
    undefined,
    input,
  );
