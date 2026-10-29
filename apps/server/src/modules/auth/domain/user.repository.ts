import type { User } from "./user.entity.js";
import type { SessionTokens } from "./session.js";

export const USER_REPOSITORY = Symbol("USER_REPOSITORY");

export type CreateLocalUserInput = {
  email: string;
  password: string;
  fullName?: string;
};

export type VerifyCredentialsInput = {
  email: string;
  password: string;
};

export type UserSessionRecord = {
  expiresAt: number;
};

export interface UserRepository {
  createLocalUser(input: CreateLocalUserInput): Promise<User>;
  verifyLocalCredentials(input: VerifyCredentialsInput): Promise<User | null>;
  getById(userId: string): Promise<User | null>;
  existsByEmail(email: string): Promise<boolean>;
  createSession(input: SessionTokens): Promise<UserSessionRecord>;
  getRefreshUser(refreshToken: string): Promise<User | null>;
  getSessionUser(token: string): Promise<User | null>;
  rotateSession(
    refreshToken: string,
    next: SessionTokens,
  ): Promise<UserSessionRecord | null>;
  revokeRefreshSession(refreshToken: string): Promise<void>;
  revokeSession(token: string): Promise<void>;
}
