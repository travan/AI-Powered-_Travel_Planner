import type { FastifyInstance } from "fastify";
import { recommendationService } from "../modules/recommendations/application/recommendation.service.js";
import {
  placeRecommendationQueryDto,
  transportRecommendationQueryDto,
} from "../modules/recommendations/dto/recommendation.dto.js";
import { parseDto } from "../shared/http/validation.js";

export async function recommendationRoutes(fastify: FastifyInstance) {
  fastify.get("/recommendations/places", async (request, reply) => {
    const query = parseDto(placeRecommendationQueryDto, request.query, reply);
    if (!query) return;

    return reply.send(await recommendationService.places(query));
  });

  fastify.get("/recommendations/transport-prices", async (request, reply) => {
    const query = parseDto(transportRecommendationQueryDto, request.query, reply);
    if (!query) return;

    return reply.send(await recommendationService.transportPrices(query));
  });
}
