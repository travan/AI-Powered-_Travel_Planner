import { resolveApiUrl } from "@travel/api-client";
import type {
  AccommodationBooking,
  GenerateRequest,
  Itinerary,
  PlanningIssue,
  PlanningJob,
  PlanRevision,
} from "@travel/types";
import { ApiRequestError } from "./api";

export async function journeyRequest<T>(
  path: string,
  token?: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(
    resolveApiUrl(`/api/${path}`, {
      publicBaseUrl: process.env["NEXT_PUBLIC_API_URL"] ?? "",
    }),
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new ApiRequestError(
      typeof detail?.message === "string"
        ? detail.message
        : `Yêu cầu thất bại (${response.status}).`,
      response.status,
      typeof detail?.code === "string" ? detail.code : undefined,
      detail?.params,
    );
  }
  return response.json() as Promise<T>;
}
export const validateJourney = (request: GenerateRequest) =>
  journeyRequest<{ valid: boolean; issues: PlanningIssue[] }>(
    "planning/validate",
    undefined,
    request,
  );
export const getJourneyJob = (
  id: string,
  token: string,
  signal?: AbortSignal,
) =>
  journeyRequest<PlanningJob>(
    `itinerary/jobs/${id}`,
    token,
    undefined,
    "GET",
    signal,
  );
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
