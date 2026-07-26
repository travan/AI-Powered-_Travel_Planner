import { Inject, Injectable } from "@nestjs/common";
import crypto from "node:crypto";
import { promisify } from "node:util";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import type { User } from "../domain/user.entity.js";
import type {
  CreateLocalUserInput,
  UserRepository,
  VerifyCredentialsInput,
} from "../domain/user.repository.js";

const scryptAsync = promisify(crypto.scrypt);
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  provider: "local" | "google";
  created_at: string;
};

type UserWithPasswordRow = UserRow & {
  password_hash: string;
};

@Injectable()
export class PostgresUserRepository implements UserRepository {
  constructor(@Inject(SQL_CLIENT) private readonly sql: SqlClient) {}

  async createLocalUser(input: CreateLocalUserInput): Promise<User> {
    const passwordHash = await hashPassword(input.password);
    const result = await this.sql.query<UserRow>(
      `insert into users (email, password_hash, full_name, display_name, provider)
       values ($1, $2, $3, $3, 'local')
       returning id::text, email::text, full_name, avatar_url, provider, created_at::text`,
      [
        normalizeEmail(input.email),
        passwordHash,
        input.fullName?.trim() || null,
      ],
    );
    return mapUser(result.rows[0]!);
  }

  async verifyLocalCredentials(
    input: VerifyCredentialsInput,
  ): Promise<User | null> {
    const result = await this.sql.query<UserWithPasswordRow>(
      `select id::text, email::text, password_hash, full_name, avatar_url, provider, created_at::text
       from users
       where email = $1
       limit 1`,
      [normalizeEmail(input.email)],
    );
    const user = result.rows[0];
    if (!user) return null;
    if (!(await verifyPassword(input.password, user.password_hash)))
      return null;
    return mapUser(user);
  }

  async getById(userId: string): Promise<User | null> {
    const result = await this.sql.query<UserRow>(
      `select id::text, email::text, full_name, avatar_url, provider, created_at::text
       from users
       where id = $1
       limit 1`,
      [userId],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const result = await this.sql.query<{ exists: boolean }>(
      "select exists(select 1 from users where email = $1) as exists",
      [normalizeEmail(email)],
    );
    return Boolean(result.rows[0]?.exists);
  }

  async createSession(input: {
    userId: string;
    token: string;
  }): Promise<{ expiresAt: number }> {
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
    await this.sql.query(
      `insert into user_sessions (user_id, token_hash, expires_at)
       values ($1, $2, $3)`,
      [input.userId, hashToken(input.token), expiresAt],
    );
    return { expiresAt: Math.floor(expiresAt.getTime() / 1000) };
  }

  async revokeSession(token: string): Promise<void> {
    await this.sql.query(
      `update user_sessions
       set revoked_at = now()
       where token_hash = $1 and revoked_at is null`,
      [hashToken(token)],
    );
  }
}

function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    provider: row.provider,
    createdAt: row.created_at,
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, key] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !key) return false;

  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(key, "hex");
  if (storedKey.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(storedKey, derivedKey);
}
