import type { FastifyInstance } from "fastify";
import { supabase } from "../../db/supabase.js";
import { cacheGet, cacheSet, TTL } from "../../db/redis.js";

export async function getItineraryRoutes(fastify: FastifyInstance) {
  // GET /itinerary/:id
  fastify.get<{ Params: { id: string } }>("/itinerary/:id", async (request, reply) => {
    const { id } = request.params;

    // Check Redis cache
    const cached = await cacheGet(`itinerary:${id}`);
    if (cached) return reply.send(cached);

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

    return reply.send(data);
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

      return reply.send(data);
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
