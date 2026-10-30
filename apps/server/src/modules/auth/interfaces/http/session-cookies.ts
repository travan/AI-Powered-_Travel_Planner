import type { Request, Response } from "express";
import { throwHttpError } from "../../../../shared/nest/http-errors.js";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
} from "../../domain/session.js";
import type { AuthResponse } from "../../application/auth.service.js";

export function readCookie(request: Request, name: string): string | undefined {
  const part = request.headers.cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  if (!part) return undefined;
  try {
    return decodeURIComponent(part.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

export function assertBrowserRequest(request: Request) {
  // Custom headers require a CORS preflight. Cross-site forms cannot set this.
  if (request.headers["x-auth-client"] !== "web")
    throwHttpError(403, "Invalid browser auth request");
  if (request.headers["sec-fetch-site"] === "cross-site")
    throwHttpError(403, "Cross-site auth request denied");
}

function options(request: Request) {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" ||
      request.secure ||
      request.headers["x-forwarded-proto"] === "https",
    sameSite: "lax" as const,
    path: "/",
  };
}

export function clearSessionCookies(request: Request, response: Response) {
  response.clearCookie(ACCESS_COOKIE, options(request));
  response.clearCookie(REFRESH_COOKIE, options(request));
  response.setHeader("Cache-Control", "no-store");
}

export function authResponse(
  value: AuthResponse,
  request: Request,
  response: Response,
) {
  response.setHeader("Cache-Control", "no-store");
  if (request.headers["x-auth-client"] !== "web") return value;
  assertBrowserRequest(request);
  response.cookie(ACCESS_COOKIE, value.session.access_token, {
    ...options(request),
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  response.cookie(REFRESH_COOKIE, value.session.refresh_token, {
    ...options(request),
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
  // Native clients store refresh tokens in OS SecureStore; browsers only get a cookie.
  return { ...value, session: { ...value.session, refresh_token: "" } };
}
