import type { FastifyInstance } from "fastify";
import { billService } from "../modules/bills/application/bill.service.js";
import {
  billIdParamsDto,
  createBillUploadDto,
  createBillUploadParamsDto,
} from "../modules/bills/dto/bill.dto.js";
import { parseDto, sendServiceError } from "../shared/http/validation.js";

type AuthenticatedUser = {
  sub: string;
};

export async function billRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string } }>(
    "/trips/:id/bills",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(createBillUploadParamsDto, request.params, reply);
      if (!params) return;
      const dto = parseDto(createBillUploadDto, request.body, reply);
      if (!dto) return;

      const result = await billService.create({
        tripId: params.id,
        userId: getUserId(request),
        dto,
      });
      if (!result.ok) return sendServiceError(reply, result.error);

      return reply.status(201).send(result.value);
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/bills/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(billIdParamsDto, request.params, reply);
      if (!params) return;

      const result = await billService.getById(params.id);
      if (!result.ok) return sendServiceError(reply, result.error);

      return reply.send(result.value);
    }
  );
}

function getUserId(request: { user: unknown }): string {
  return (request.user as AuthenticatedUser).sub;
}
