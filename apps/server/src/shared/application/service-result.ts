export type ServiceErrorCode = "bad_request" | "unauthorized" | "forbidden" | "not_found" | "conflict" | "internal_error";

export type ServiceError = {
  code: ServiceErrorCode;
  statusCode: number;
  message: string;
  apiCode?: string;
};

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

export function ok<T>(value: T): ServiceResult<T> {
  return { ok: true, value };
}

export function conflict(message: string, apiCode?: string): ServiceResult<never> {
  return { ok: false, error: { code: "conflict", statusCode: 409, message, apiCode } };
}

export function notFound(message: string): ServiceResult<never> {
  return { ok: false, error: { code: "not_found", statusCode: 404, message } };
}

export function badRequest(message: string, apiCode?: string): ServiceResult<never> {
  return { ok: false, error: { code: "bad_request", statusCode: 400, message, apiCode } };
}

export function unauthorized(message: string, apiCode?: string): ServiceResult<never> {
  return { ok: false, error: { code: "unauthorized", statusCode: 401, message, apiCode } };
}

export function forbidden(message: string, apiCode?: string): ServiceResult<never> {
  return { ok: false, error: { code: "forbidden", statusCode: 403, message, apiCode } };
}

export function httpErrorLabel(statusCode: number): string {
  if (statusCode === 400) return "Bad Request";
  if (statusCode === 401) return "Unauthorized";
  if (statusCode === 403) return "Forbidden";
  if (statusCode === 404) return "Not Found";
  if (statusCode === 409) return "Conflict";
  return "Error";
}
