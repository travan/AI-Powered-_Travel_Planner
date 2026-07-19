import type { FastifyInstance } from "fastify";
import { searchDraftService } from "../modules/search-drafts/application/search-draft.service.js";
import { claimSearchDraftDto, createSearchDraftDto, searchDraftParamsDto } from "../modules/search-drafts/dto/search-draft.dto.js";
import { parseDto, sendServiceError } from "../shared/http/validation.js";

export async function searchDraftRoutes(fastify: FastifyInstance) {
  fastify.post("/search-drafts", async (request, reply) => {
    const dto = parseDto(createSearchDraftDto, request.body, reply);
    if (!dto) return;

    const draft = await searchDraftService.create(dto);

    return reply.status(201).send(draft);
  });

  fastify.post<{ Params: { id: string } }>(
    "/search-drafts/:id/claim",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(searchDraftParamsDto, request.params, reply);
      if (!params) return;
      const dto = parseDto(claimSearchDraftDto, request.body, reply);
      if (!dto) return;

      const userId = (request.user as { sub: string }).sub;
      const result = await searchDraftService.claim({
        draftId: params.id,
        userId,
        dto,
      });

      if (!result.ok) {
        return sendServiceError(reply, result.error);
      }

      return reply.send(result.value);
    }
  );
}
