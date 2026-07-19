import type { FastifyInstance } from "fastify";
import { savePromptHistoryToMongo } from "../db/prompt-history-store.js";
import { userService } from "../modules/users/application/user.service.js";
import { promptHistoryQueryDto } from "../modules/users/dto/user.dto.js";
import { parseDto } from "../shared/http/validation.js";

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
      const query = parseDto(promptHistoryQueryDto, request.query, reply);
      if (!query) return;

      const history = await userService.getPromptHistory(userId, query.limit);

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
  rawPromptText?: string;
  itineraryId?: string;
}): Promise<void> {
  await savePromptHistoryToMongo(params);
}
