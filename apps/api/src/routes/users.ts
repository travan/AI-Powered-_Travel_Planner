import type { FastifyInstance } from "fastify";
import { getDb } from "../db/mongodb.js";

const PROMPT_HISTORY_TTL_DAYS = 90;

export async function usersRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/users/me/prompt-history?limit=5
   * Returns the authenticated user's recent generation prompts.
   * Used by the plan page to prefill smart suggestions.
   */
  fastify.get<{ Querystring: { limit?: string } }>(
    "/users/me/prompt-history",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const userId = (request.user as { sub: string }).sub;
      const limit = Math.min(Number(request.query.limit ?? 5), 20);

      const db = await getDb();
      const history = await db
        .collection("user_prompt_history")
        .find(
          { user_id: userId },
          {
            projection: {
              _id: 0,
              id: { $toString: "$_id" },
              cities: 1,
              city_names: 1,
              num_days: 1,
              budget: 1,
              currency: 1,
              trip_style: 1,
              created_at: 1,
              itinerary_id: 1,
            },
          }
        )
        .sort({ created_at: -1 })
        .limit(limit)
        .toArray();

      return reply.send(history);
    }
  );
}

/**
 * Saves a generation prompt to the user's history (fire-and-forget).
 * Called from the generate route after a job is enqueued.
 */
export async function savePromptHistory(params: {
  userId: string | null;
  cacheKey: string;
  cities: string[];
  cityNames: string[];
  input: Record<string, unknown>;
  itineraryId?: string;
}): Promise<void> {
  const { userId, cacheKey, cities, cityNames, input } = params;
  if (!userId) {
    return;
  }

  const db = await getDb();

  // Upsert by (user_id + cache_key) so repeated identical requests don't bloat the collection
  const expiresAt = new Date(Date.now() + PROMPT_HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.collection("user_prompt_history").updateOne(
    { user_id: userId, cache_key: cacheKey },
    {
      $set: {
        user_id: userId,
        cache_key: cacheKey,
        cities,
        city_names: cityNames,
        num_days: (input.num_days as number | undefined) ?? null,
        budget: (input.budget as number | undefined) ?? null,
        currency: (input.currency as string | undefined) ?? "USD",
        trip_style: (input.trip_style as string | undefined) ?? "mixed",
        created_at: new Date(),
        expires_at: expiresAt,
      },
    },
    { upsert: true }
  );
}
