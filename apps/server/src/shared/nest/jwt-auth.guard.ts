import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { LocalJwtService } from "./local-jwt.js";
import { throwHttpError } from "./http-errors.js";
import { AppConfigService } from "../../config/app-config.service.js";

export type AuthenticatedRequest = Request & {
  user?: {
    sub: string;
    email?: string;
  };
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(LocalJwtService) private readonly jwt: LocalJwtService,
    @Inject(AppConfigService) private readonly config: AppConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = getBearerToken(request.headers.authorization);
    if (!token) throwHttpError(401, "Invalid or missing token", "Unauthorized");

    const mockUserId = this.resolveMockUserId(token);
    if (mockUserId) {
      request.user = { sub: mockUserId };
      return true;
    }

    const payload = this.jwt.verify(token);
    if (!payload?.sub || typeof payload.sub !== "string") {
      throwHttpError(401, "Invalid or missing token", "Unauthorized");
    }

    request.user = {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
    };
    return true;
  }

  private resolveMockUserId(token: string): string | null {
    if (!this.config.mockTokensEnabled) return null;
    if (token.startsWith("mock-access-")) return token.slice("mock-access-".length) || null;
    if (token.startsWith("mock-mobile-access-")) return token.slice("mock-mobile-access-".length) || null;
    return null;
  }
}

export function getBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
