import type { FastifyInstance } from "fastify";
import { tripService } from "../modules/trips/application/trip.service.js";
import {
  activityStatusDto,
  activityStatusParamsDto,
  changeRequestReviewParamsDto,
  checklistStatusDto,
  checklistStatusParamsDto,
  createPlaceSubmissionDto,
  createTripActivityDto,
  createTripExpenseDto,
  reviewTripChangeRequestDto,
  tripIdParamsDto,
} from "../modules/trips/dto/trip.dto.js";
import { parseDto, sendHttpError } from "../shared/http/validation.js";

type AuthenticatedUser = {
  sub: string;
};

export async function tripRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/profile/me",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const result = await tripService.getProfile(getUserId(request));
      if (!result.ok) {
        return sendHttpError(reply, result.error.statusCode, result.error.message);
      }

      return reply.send(result.value);
    }
  );

  fastify.get(
    "/trips",
    { onRequest: [fastify.authenticate] },
    async (request) => tripService.listTrips(getUserId(request))
  );

  fastify.get<{ Params: { id: string } }>(
    "/trips/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(tripIdParamsDto, request.params, reply);
      if (!params) return;

      const result = await tripService.getTripDetail({
        tripId: params.id,
        userId: getUserId(request),
      });
      if (!result.ok) {
        return sendHttpError(reply, result.error.statusCode, result.error.message);
      }

      return reply.send(result.value);
    }
  );

  fastify.patch<{ Params: { id: string; activityId: string } }>(
    "/trips/:id/activities/:activityId/status",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(activityStatusParamsDto, request.params, reply);
      if (!params) return;
      const dto = parseDto(activityStatusDto, request.body, reply);
      if (!dto) return;

      const result = await tripService.updateActivityStatus({
        tripId: params.id,
        activityId: params.activityId,
        userId: getUserId(request),
        dto,
      });
      if (!result.ok) {
        return sendHttpError(reply, result.error.statusCode, result.error.message);
      }

      return reply.send(result.value);
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/trips/:id/activities",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(tripIdParamsDto, request.params, reply);
      if (!params) return;
      const dto = parseDto(createTripActivityDto, request.body, reply);
      if (!dto) return;

      const result = await tripService.addActivity({
        tripId: params.id,
        userId: getUserId(request),
        dto,
      });
      if (!result.ok) {
        return sendHttpError(reply, result.error.statusCode, result.error.message);
      }

      return reply.status(201).send(result.value);
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/trips/:id/place-submissions",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(tripIdParamsDto, request.params, reply);
      if (!params) return;
      const dto = parseDto(createPlaceSubmissionDto, request.body, reply);
      if (!dto) return;

      const result = await tripService.addPlaceSubmission({
        tripId: params.id,
        userId: getUserId(request),
        dto,
      });
      if (!result.ok) {
        return sendHttpError(reply, result.error.statusCode, result.error.message);
      }

      return reply.status(201).send(result.value);
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/trips/:id/expenses",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(tripIdParamsDto, request.params, reply);
      if (!params) return;
      const dto = parseDto(createTripExpenseDto, request.body, reply);
      if (!dto) return;

      const result = await tripService.addExpense({
        tripId: params.id,
        userId: getUserId(request),
        dto,
      });
      if (!result.ok) {
        return sendHttpError(reply, result.error.statusCode, result.error.message);
      }

      return reply.status(201).send(result.value);
    }
  );

  fastify.patch<{ Params: { id: string; itemId: string } }>(
    "/trips/:id/checklist/:itemId/status",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(checklistStatusParamsDto, request.params, reply);
      if (!params) return;
      const dto = parseDto(checklistStatusDto, request.body, reply);
      if (!dto) return;

      const result = await tripService.updateChecklistStatus({
        tripId: params.id,
        itemId: params.itemId,
        userId: getUserId(request),
        dto,
      });
      if (!result.ok) {
        return sendHttpError(reply, result.error.statusCode, result.error.message);
      }

      return reply.send(result.value);
    }
  );

  fastify.patch<{ Params: { id: string; requestId: string } }>(
    "/trips/:id/change-requests/:requestId/review",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const params = parseDto(changeRequestReviewParamsDto, request.params, reply);
      if (!params) return;
      const dto = parseDto(reviewTripChangeRequestDto, request.body, reply);
      if (!dto) return;

      const result = await tripService.reviewChangeRequest({
        tripId: params.id,
        requestId: params.requestId,
        userId: getUserId(request),
        dto,
      });
      if (!result.ok) {
        return sendHttpError(reply, result.error.statusCode, result.error.message);
      }

      return reply.send(result.value);
    }
  );
}

function getUserId(request: { user: unknown }): string {
  return (request.user as AuthenticatedUser).sub;
}
