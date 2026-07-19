import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { verifyJwt } from "./local-jwt.js";
import { throwHttpError } from "./http-errors.js";

export type AuthenticatedRequest = FastifyRequest & {
  user?: {
    sub: string;
    email?: string;
  };
};

const MOCK_TOKENS_ENABLED = process.env.TEST_ENABLE_MOCK_TOKENS === "true";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = getBearerToken(request.headers.authorization);
    if (!token) {
      throwHttpError(401, "Invalid or missing token", "Unauthorized");
    }

    const mockUserId = resolveMockUserId(token);
    if (mockUserId) {
      request.user = { sub: mockUserId };
      return true;
    }

    const payload = verifyJwt(token);
    if (!payload?.sub || typeof payload.sub !== "string") {
      throwHttpError(401, "Invalid or missing token", "Unauthorized");
    }

    request.user = {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
    return true;
  }
}

export function getBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

function resolveMockUserId(token: string): string | null {
  if (!MOCK_TOKENS_ENABLED) return null;

  if (token.startsWith("mock-access-")) {
    return token.slice("mock-access-".length) || null;
  }

  if (token.startsWith("mock-mobile-access-")) {
    return token.slice("mock-mobile-access-".length) || null;
  }

  return null;
}
