import type { FastifyInstance } from "fastify";
import type { Itinerary, ItineraryOutput } from "@travel/types";
import { itineraryStore } from "../../db/itinerary-store.js";
import { cacheGet, cacheSet, TTL } from "../../db/redis.js";

export async function getItineraryRoutes(fastify: FastifyInstance) {
  // GET /itinerary/:id
  fastify.get<{ Params: { id: string } }>("/itinerary/:id", async (request, reply) => {
    const { id } = request.params;

    // Check Redis cache
    const cached = await cacheGet(`itinerary:${id}`);
    if (cached) {
      const normalized = normalizeItineraryOutput(cached, id);
      if (normalized) return reply.send(normalized);
    }

    const data = await itineraryStore.findById(id);

    if (!data) {
      return reply.status(404).send({ statusCode: 404, error: "Not Found", message: "Itinerary not found" });
    }

    // Cache for 1 hour
    await cacheSet(`itinerary:${id}`, data, TTL.ITINERARY_RESULT);

    const normalized = normalizeItineraryOutput(data, id);
    if (!normalized) {
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Stored itinerary has an unexpected shape",
      });
    }

    return reply.send(normalized);
  });

  // GET /itinerary/job/:jobId (local/dev fallback retrieval)
  fastify.get<{ Params: { jobId: string } }>("/itinerary/job/:jobId", async (request, reply) => {
    const { jobId } = request.params;
    const localKey = `itinerary:local-${jobId}`;
    const cached = await cacheGet(localKey);
    if (cached) {
      const normalized = normalizeItineraryOutput(cached, `local-${jobId}`);
      if (normalized) return reply.send(normalized);
    }

    const data = await itineraryStore.findByJobId(jobId);

    if (!data) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Itinerary for job not found",
      });
    }

    const itineraryId = typeof data.id === "string" ? data.id : `local-${jobId}`;

    if (typeof data.id === "string") {
      await cacheSet(`itinerary:${data.id}`, data, TTL.ITINERARY_RESULT);
    }

    const normalized = normalizeItineraryOutput(data, itineraryId);
    if (!normalized) {
      return reply.status(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: "Stored itinerary has an unexpected shape",
      });
    }

    return reply.send(normalized);
  });

  // GET /itinerary/shared/:shareToken (public)
  fastify.get<{ Params: { shareToken: string } }>(
    "/itinerary/shared/:shareToken",
    async (request, reply) => {
      const { shareToken } = request.params;

      const data = await itineraryStore.findSharedByToken(shareToken);

      if (!data) {
        return reply.status(404).send({ statusCode: 404, error: "Not Found", message: "Shared itinerary not found" });
      }

      const normalized = normalizeItineraryOutput(data, data.id as string | undefined);
      if (!normalized) {
        return reply.status(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Stored shared itinerary has an unexpected shape",
        });
      }

      return reply.send(normalized);
    }
  );

  // POST /itinerary/:id/save (auth required)
  fastify.post<{ Params: { id: string } }>(
    "/itinerary/:id/save",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const userId = (request.user as { id: string }).id;

      try {
        await itineraryStore.saveTrip(userId, id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save itinerary";
        return reply.status(500).send({ statusCode: 500, error: "Internal Server Error", message });
      }

      return reply.send({ saved: true });
    }
  );

  // PATCH /itinerary/:id/share (toggle public)
  fastify.patch<{ Params: { id: string }; Body: { is_public: boolean } }>(
    "/itinerary/:id/share",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params;
      const userId = (request.user as { id: string }).id;
      const { is_public } = request.body as { is_public: boolean };

      const data = await itineraryStore.setPublic({ id, userId, isPublic: is_public });

      if (!data) {
        return reply.status(403).send({ statusCode: 403, error: "Forbidden", message: "Not your itinerary" });
      }

      return reply.send({ is_public, share_token: data?.share_token });
    }
  );
}

function normalizeItineraryOutput(
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
