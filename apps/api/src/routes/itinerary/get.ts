import type { FastifyInstance } from "fastify";
import { itineraryService } from "../../modules/itinerary/application/itinerary.service.js";
import {
  itineraryIdParamsDto,
  itineraryJobParamsDto,
  itineraryShareTokenParamsDto,
  shareItineraryDto,
} from "../../modules/itinerary/dto/itinerary.dto.js";
import { parseDto, sendServiceError } from "../../shared/http/validation.js";

export async function getItineraryRoutes(fastify: FastifyInstance) {
  // GET /itinerary/:id
  fastify.get<{ Params: { id: string } }>("/itinerary/:id", async (request, reply) => {
    const params = parseDto(itineraryIdParamsDto, request.params, reply);
    if (!params) return;
    const { id } = params;

    const result = await itineraryService.getById(id);
    if (!result.ok) {
      return sendServiceError(reply, result.error);
    }

    return reply.send(result.value);
  });

  // GET /itinerary/job/:jobId (local/dev fallback retrieval)
  fastify.get<{ Params: { jobId: string } }>("/itinerary/job/:jobId", async (request, reply) => {
    const params = parseDto(itineraryJobParamsDto, request.params, reply);
    if (!params) return;
    const { jobId } = params;

    const result = await itineraryService.getByJobId(jobId);
    if (!result.ok) {
      return sendServiceError(reply, result.error);
    }

    return reply.send(result.value);
  });

  // GET /itinerary/shared/:shareToken (public)
  fastify.get<{ Params: { shareToken: string } }>(
    "/itinerary/shared/:shareToken",
    async (request, reply) => {
      const params = parseDto(itineraryShareTokenParamsDto, request.params, reply);
      if (!params) return;
      const { shareToken } = params;

      const result = await itineraryService.getShared(shareToken);
      if (!result.ok) {
        return sendServiceError(reply, result.error);
      }

      return reply.send(result.value);
    }
  );

  // POST /itinerary/:id/save (auth required)
  fastify.post<{ Params: { id: string } }>(
    "/itinerary/:id/save",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(itineraryIdParamsDto, request.params, reply);
      if (!params) return;
      const { id } = params;
      const userId = (request.user as { sub: string }).sub;

      const result = await itineraryService.save({ itineraryId: id, userId });
      if (!result.ok) {
        return sendServiceError(reply, result.error);
      }

      return reply.send(result.value);
    }
  );

  // PATCH /itinerary/:id/share (toggle public)
  fastify.patch<{ Params: { id: string }; Body: { is_public: boolean } }>(
    "/itinerary/:id/share",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(itineraryIdParamsDto, request.params, reply);
      if (!params) return;
      const dto = parseDto(shareItineraryDto, request.body, reply);
      if (!dto) return;
      const { id } = params;
      const userId = (request.user as { sub: string }).sub;

      const result = await itineraryService.share({ itineraryId: id, userId, dto });
      if (!result.ok) {
        return sendServiceError(reply, result.error);
      }

      return reply.send(result.value);
    }
  );
}
