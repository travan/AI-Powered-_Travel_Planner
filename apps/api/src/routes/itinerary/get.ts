import type { FastifyInstance } from "fastify";
import type { Itinerary, ItineraryOutput } from "@travel/types";
import { supabase } from "../../db/supabase.js";
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

    // Fetch from Supabase
    const { data, error } = await supabase
      .from("itineraries")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
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

    const { data, error } = await supabase
      .from("itineraries")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (error || !data) {
      return reply.status(404).send({
        statusCode: 404,
        error: "Not Found",
        message: "Itinerary for job not found",
      });
    }

    if (data.id) {
      await cacheSet(`itinerary:${data.id}`, data, TTL.ITINERARY_RESULT);
    }

    const normalized = normalizeItineraryOutput(data, data.id ?? `local-${jobId}`);
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

      const { data, error } = await supabase
        .from("itineraries")
        .select("*")
        .eq("share_token", shareToken)
        .eq("is_public", true)
        .single();

      if (error || !data) {
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

      const { error } = await supabase
        .from("saved_trips")
        .upsert({ user_id: userId, itinerary_id: id }, { onConflict: "user_id,itinerary_id" });

      if (error) {
        return reply.status(500).send({ statusCode: 500, error: "Internal Server Error", message: error.message });
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

      // Generate share token on first public share
      const shareToken = is_public
        ? `${id.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`
        : null;

      const { data, error } = await supabase
        .from("itineraries")
        .update({ is_public, share_token: shareToken })
        .eq("id", id)
        .eq("user_id", userId)
        .select("share_token")
        .single();

      if (error) {
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
