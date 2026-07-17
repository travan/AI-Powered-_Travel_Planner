import type { Itinerary, ItineraryOutput } from "@travel/types";
import { itineraryStore } from "../../../db/itinerary-store.js";
import { cacheGet, cacheSet, TTL } from "../../../db/redis.js";
import { forbidden, internalError, notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import type { ShareItineraryDto } from "../dto/itinerary.dto.js";

export class ItineraryService {
  async getById(id: string): Promise<ServiceResult<ItineraryOutput>> {
    const cached = await cacheGet(`itinerary:${id}`);
    if (cached) {
      const normalized = normalizeItineraryOutput(cached, id);
      if (normalized) return ok(normalized);
    }

    const data = await itineraryStore.findById(id);
    if (!data) return notFound("Itinerary not found");

    await cacheSet(`itinerary:${id}`, data, TTL.ITINERARY_RESULT);
    const normalized = normalizeItineraryOutput(data, id);
    return normalized ? ok(normalized) : internalError("Stored itinerary has an unexpected shape", "invalid_itinerary_shape");
  }

  async getByJobId(jobId: string): Promise<ServiceResult<ItineraryOutput>> {
    const localKey = `itinerary:local-${jobId}`;
    const cached = await cacheGet(localKey);
    if (cached) {
      const normalized = normalizeItineraryOutput(cached, `local-${jobId}`);
      if (normalized) return ok(normalized);
    }

    const data = await itineraryStore.findByJobId(jobId);
    if (!data) return notFound("Itinerary for job not found");

    const itineraryId = typeof data.id === "string" ? data.id : `local-${jobId}`;
    if (typeof data.id === "string") {
      await cacheSet(`itinerary:${data.id}`, data, TTL.ITINERARY_RESULT);
    }

    const normalized = normalizeItineraryOutput(data, itineraryId);
    return normalized ? ok(normalized) : internalError("Stored itinerary has an unexpected shape", "invalid_itinerary_shape");
  }

  async getShared(shareToken: string): Promise<ServiceResult<ItineraryOutput>> {
    const data = await itineraryStore.findSharedByToken(shareToken);
    if (!data) return notFound("Shared itinerary not found");

    const normalized = normalizeItineraryOutput(data, data.id as string | undefined);
    return normalized ? ok(normalized) : internalError("Stored shared itinerary has an unexpected shape", "invalid_itinerary_shape");
  }

  async save(input: { itineraryId: string; userId: string }): Promise<ServiceResult<{ saved: true }>> {
    await itineraryStore.saveTrip(input.userId, input.itineraryId);
    return ok({ saved: true });
  }

  async share(input: {
    itineraryId: string;
    userId: string;
    dto: ShareItineraryDto;
  }): Promise<ServiceResult<{ is_public: boolean; share_token: string | null }>> {
    const data = await itineraryStore.setPublic({
      id: input.itineraryId,
      userId: input.userId,
      isPublic: input.dto.is_public,
    });

    return data
      ? ok({ is_public: input.dto.is_public, share_token: data.share_token })
      : forbidden("Not your itinerary");
  }
}

export const itineraryService = new ItineraryService();

export function normalizeItineraryOutput(
  value: unknown,
  fallbackId?: string
): ItineraryOutput | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;

  if (Array.isArray(record.itineraries)) {
    return value as ItineraryOutput;
  }

  if (isItinerary(record)) {
    return {
      itineraries: [
        {
          ...record,
          id: typeof record.id === "string" ? record.id : fallbackId,
        } as Itinerary,
      ],
    };
  }

  if (record.result && typeof record.result === "object" && isItinerary(record.result)) {
    return {
      itineraries: [
        {
          ...(record.result as Itinerary),
          id: typeof record.id === "string" ? record.id : fallbackId,
        },
      ],
    };
  }

  return null;
}

function isItinerary(value: unknown): value is Itinerary {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;
  return (
    typeof record.title === "string" &&
    Array.isArray(record.days) &&
    typeof record.currency === "string"
  );
}
