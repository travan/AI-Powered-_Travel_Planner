import type { FastifyInstance } from "fastify";
import { cityService } from "../modules/cities/application/city.service.js";
import { citySearchQueryDto, citySlugParamsDto } from "../modules/cities/dto/city.dto.js";
import { parseDto, sendServiceError } from "../shared/http/validation.js";

export async function citiesRoutes(fastify: FastifyInstance) {
  // ── Search (autocomplete) ──────────────────────────────────────────────────
  fastify.get<{ Querystring: { q: string } }>("/cities/search", async (request, reply) => {
    const query = parseDto(citySearchQueryDto, request.query, reply);
    if (!query) return;

    return reply.send(await cityService.search(query.q));
  });

  // ── Popular cities (for trending/homepage) ─────────────────────────────────
  fastify.get("/cities/popular", async (_request, reply) => reply.send(await cityService.popular()));

  // ── City detail ────────────────────────────────────────────────────────────
  fastify.get<{ Params: { slug: string } }>("/cities/:slug", async (request, reply) => {
    const params = parseDto(citySlugParamsDto, request.params, reply);
    if (!params) return;
    const { slug } = params;

    const result = await cityService.getDetail(slug);
    if (!result.ok) {
      return sendServiceError(reply, result.error);
    }

    return reply.send(result.value);
  });
}
