import { randomUUID } from "node:crypto";
import type { AuthUser } from "../../../db/auth-store.js";
import {
  createLocalUser,
  createUserSession,
  getUserById,
  revokeUserSession,
  userExistsByEmail,
  verifyLocalUserCredentials,
} from "../../../db/auth-store.js";
import { conflict, notFound, ok, unauthorized, type ServiceResult } from "../../../shared/application/service-result.js";
import type { LoginDto, SignupDto } from "../dto/auth.dto.js";

export type ApiAuthUser = {
  id: string;
  email: string;
  user_metadata: {
    full_name: string | null;
    avatar_url: string | null;
  };
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: ApiAuthUser;
};

type JwtSigner = {
  sign: (payload: Record<string, unknown>, options: { expiresIn: number }) => string;
};

export class AuthService {
  accountExists(email: string): Promise<boolean> {
    return userExistsByEmail(email);
  }

  async signup(input: {
    dto: SignupDto;
    jwt: JwtSigner;
  }): Promise<ServiceResult<{ user: ApiAuthUser; session: AuthSession }>> {
    try {
      const user = await createLocalUser({
        email: input.dto.email,
        password: input.dto.password,
        fullName: input.dto.full_name,
      });
      const session = await this.signSession(input.jwt, user);
      return ok({ user: toApiUser(user), session });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return conflict("User already registered", "user_already_exists");
      }
      throw error;
    }
  }

  async login(input: {
    dto: LoginDto;
    jwt: JwtSigner;
  }): Promise<ServiceResult<{ user: ApiAuthUser; session: AuthSession }>> {
    const user = await verifyLocalUserCredentials(input.dto);
    if (!user) return unauthorized("Invalid login credentials", "invalid_credentials");

    const session = await this.signSession(input.jwt, user);
    return ok({ user: toApiUser(user), session });
  }

  async getMe(userId: string): Promise<ServiceResult<{ user: ApiAuthUser }>> {
    const user = await getUserById(userId);
    return user ? ok({ user: toApiUser(user) }) : notFound("User not found");
  }

  async logout(token: string | null): Promise<{ ok: true }> {
    if (token) {
      await revokeUserSession(token);
    }
    return { ok: true };
  }

  private async signSession(jwt: JwtSigner, user: AuthUser): Promise<AuthSession> {
    const expiresIn = 7 * 24 * 60 * 60;
    const accessToken = jwt.sign(
      { sub: user.id, email: user.email, jti: randomUUID() },
      { expiresIn }
    );
    const { expiresAt } = await createUserSession({ userId: user.id, token: accessToken });

    return {
      access_token: accessToken,
      refresh_token: "",
      token_type: "bearer",
      expires_in: expiresIn,
      expires_at: expiresAt,
      user: toApiUser(user),
    };
  }
}

export const authService = new AuthService();

export function toApiUser(user: {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}): ApiAuthUser {
  return {
    id: user.id,
    email: user.email,
    user_metadata: {
      full_name: user.full_name,
      avatar_url: user.avatar_url,
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    typeof error === "object" &&
      error &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505"
  );
}
