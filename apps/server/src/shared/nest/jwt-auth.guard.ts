import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { LocalJwtService } from "./local-jwt.js";
import { throwHttpError } from "./http-errors.js";
import { AppConfigService } from "../../config/app-config.service.js";
import { SQL_CLIENT, type SqlClient } from "../../database/database.tokens.js";

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
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(SQL_CLIENT) private readonly sql: SqlClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const session = await this.sql.query<{ active: boolean }>(
      `select exists (
         select 1
         from user_sessions
         where token_hash = $1
           and revoked_at is null
           and expires_at > now()
       ) as active`,
      [hashToken(token)],
    );
    if (!session.rows[0]?.active) {
      throwHttpError(401, "Invalid or expired session", "Unauthorized");
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

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
