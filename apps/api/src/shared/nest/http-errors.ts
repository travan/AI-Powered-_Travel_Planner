import { HttpException } from "@nestjs/common";
import type { ServiceError } from "../application/service-result.js";
import { httpErrorLabel } from "../application/service-result.js";

export function throwServiceError(error: ServiceError): never {
  const payload: { statusCode: number; error: string; message: string; code?: string } = {
    statusCode: error.statusCode,
    error: httpErrorLabel(error.statusCode),
    message: error.message,
  };
  if (error.apiCode) payload.code = error.apiCode;

  throw new HttpException(payload, error.statusCode);
}

export function throwHttpError(
  statusCode: number,
  message: string,
  error = statusCode === 403 ? "Forbidden" : statusCode === 404 ? "Not Found" : "Error"
): never {
  throw new HttpException({ statusCode, error, message }, statusCode);
}
