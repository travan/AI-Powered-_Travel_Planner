import { Inject, Injectable } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { ACCESS_TTL_SECONDS } from "../domain/session.js";
import {
  conflict,
  notFound,
  ok,
  unauthorized,
  type ServiceResult,
} from "../../../shared/application/service-result.js";
import type { JwtSigner } from "../../../shared/nest/local-jwt.js";
import type { LoginDto, SignupDto } from "../dto/auth.dto.js";
import { toApiUser, type ApiUser, type User } from "../domain/user.entity.js";
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../domain/user.repository.js";

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: ApiUser;
};

export type AuthResponse = {
  user: ApiUser;
  session: AuthSession;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  accountExists(email: string): Promise<boolean> {
    return this.users.existsByEmail(email);
  }

  async signup(input: {
    dto: SignupDto;
    jwt: JwtSigner;
  }): Promise<ServiceResult<AuthResponse>> {
    try {
      const user = await this.users.createLocalUser({
        email: input.dto.email,
        password: input.dto.password,
        fullName: input.dto.full_name,
      });
      const session = await this.signSession(input.jwt, user);
      return ok({ user: toApiUser(user), session });
    } catch (error) {
      if (isUniqueViolation(error))
        return conflict("User already registered", "user_already_exists");
      throw error;
    }
  }

  async login(input: {
    dto: LoginDto;
    jwt: JwtSigner;
  }): Promise<ServiceResult<AuthResponse>> {
    const user = await this.users.verifyLocalCredentials(input.dto);
    if (!user)
      return unauthorized("Invalid login credentials", "invalid_credentials");

    const session = await this.signSession(input.jwt, user);
    return ok({ user: toApiUser(user), session });
  }

  async getMe(userId: string): Promise<ServiceResult<{ user: ApiUser }>> {
    const user = await this.users.getById(userId);
    return user ? ok({ user: toApiUser(user) }) : notFound("User not found");
  }

  async refresh(
    refreshToken: string,
    jwt: JwtSigner,
  ): Promise<ServiceResult<AuthResponse>> {
    const user = await this.users.getRefreshUser(refreshToken);
    if (!user)
      return unauthorized("Invalid or expired session", "invalid_session");
    const tokens = this.newTokens(jwt, user);
    const stored = await this.users.rotateSession(refreshToken, tokens);
    if (!stored)
      return unauthorized("Invalid or expired session", "invalid_session");
    return ok({
      user: toApiUser(user),
      session: this.sessionResponse(user, tokens, stored.expiresAt),
    });
  }

  async restore(
    token: string,
    expiresAt: number,
  ): Promise<ServiceResult<AuthResponse>> {
    const user = await this.users.getSessionUser(token);
    if (!user)
      return unauthorized("Invalid or expired session", "invalid_session");
    return ok({
      user: toApiUser(user),
      session: {
        ...this.sessionResponse(user, { token, refreshToken: "" }, expiresAt),
        expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
      },
    });
  }

  async logout(
    token: string | null,
    refreshToken?: string,
  ): Promise<{ ok: true }> {
    if (token) await this.users.revokeSession(token);
    if (refreshToken) await this.users.revokeRefreshSession(refreshToken);
    return { ok: true };
  }

  async signSession(jwt: JwtSigner, user: User): Promise<AuthSession> {
    const tokens = this.newTokens(jwt, user);
    const { expiresAt } = await this.users.createSession(tokens);
    return this.sessionResponse(user, tokens, expiresAt);
  }

  private newTokens(jwt: JwtSigner, user: User) {
    return {
      userId: user.id,
      token: jwt.sign(
        { sub: user.id, email: user.email, jti: randomUUID() },
        { expiresIn: ACCESS_TTL_SECONDS },
      ),
      refreshToken: randomBytes(32).toString("hex"),
    };
  }

  private sessionResponse(
    user: User,
    tokens: { token: string; refreshToken: string },
    expiresAt: number,
  ): AuthSession {
    return {
      access_token: tokens.token,
      refresh_token: tokens.refreshToken,
      token_type: "bearer",
      expires_in: ACCESS_TTL_SECONDS,
      expires_at: expiresAt,
      user: toApiUser(user),
    };
  }
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    typeof error === "object" &&
    error &&
    "code" in error &&
    error.code === "23505",
  );
}
