import type { User } from "./user.entity.js";

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
  createSession(input: { userId: string; token: string }): Promise<UserSessionRecord>;
  revokeSession(token: string): Promise<void>;
}
