export type ServiceErrorCode = "bad_request" | "conflict" | "forbidden" | "internal_error" | "not_found" | "unauthorized";

export type ServiceError = {
  code: ServiceErrorCode;
  statusCode: 400 | 401 | 403 | 404 | 409 | 500;
  message: string;
  apiCode?: string;
};

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

export const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });

export const badRequest = (message: string, apiCode?: string): ServiceResult<never> => ({
  ok: false,
  error: { code: "bad_request", statusCode: 400, message, apiCode },
});

export const conflict = (message: string, apiCode?: string): ServiceResult<never> => ({
  ok: false,
  error: { code: "conflict", statusCode: 409, message, apiCode },
});

export const forbidden = (message: string, apiCode?: string): ServiceResult<never> => ({
  ok: false,
  error: { code: "forbidden", statusCode: 403, message, apiCode },
});

export const internalError = (message: string, apiCode?: string): ServiceResult<never> => ({
  ok: false,
  error: { code: "internal_error", statusCode: 500, message, apiCode },
});

export const notFound = (message: string, apiCode?: string): ServiceResult<never> => ({
  ok: false,
  error: { code: "not_found", statusCode: 404, message, apiCode },
});

export const unauthorized = (message: string, apiCode?: string): ServiceResult<never> => ({
  ok: false,
  error: { code: "unauthorized", statusCode: 401, message, apiCode },
});

export function httpErrorLabel(statusCode: ServiceError["statusCode"]) {
  if (statusCode === 400) return "Bad Request";
  if (statusCode === 401) return "Unauthorized";
  if (statusCode === 403) return "Forbidden";
  if (statusCode === 404) return "Not Found";
  if (statusCode === 409) return "Conflict";
  if (statusCode === 500) return "Internal Server Error";
  return "Error";
}
