import type { FastifyReply } from "fastify";
import type { z } from "zod";
import type { ServiceError } from "../application/service-result.js";
import { httpErrorLabel } from "../application/service-result.js";

export type ApiErrorResponse = {
  statusCode: number;
  error: string;
  message: unknown;
};

export function parseDto<T extends z.ZodTypeAny>(
  schema: T,
  payload: unknown,
  reply: FastifyReply
): z.infer<T> | null {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;

  const flattened = parsed.error.flatten();

  reply.status(400).send({
    statusCode: 400,
    error: "Bad Request",
    message: {
      fieldErrors: flattened.fieldErrors,
      formErrors: flattened.formErrors,
    },
  } satisfies ApiErrorResponse);
  return null;
}

export function sendHttpError(
  reply: FastifyReply,
  statusCode: number,
  message: string,
  error = statusCode === 403 ? "Forbidden" : statusCode === 404 ? "Not Found" : "Error"
) {
  return reply.status(statusCode).send({
    statusCode,
    error,
    message,
  } satisfies ApiErrorResponse);
}

export function sendServiceError(reply: FastifyReply, error: ServiceError) {
  const payload: ApiErrorResponse & { code?: string } = {
    statusCode: error.statusCode,
    error: httpErrorLabel(error.statusCode),
    message: error.message,
  };
  if (error.apiCode) payload.code = error.apiCode;
  return reply.status(error.statusCode).send(payload);
}
