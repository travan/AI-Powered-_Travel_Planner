import { Inject, Injectable } from "@nestjs/common";
import crypto from "node:crypto";
import { promisify } from "node:util";
import {
  SQL_CLIENT,
  POSTGRES_POOL,
  type SqlClient,
} from "../../../database/database.tokens.js";
import type { User } from "../domain/user.entity.js";
import type {
  CreateLocalUserInput,
  UserRepository,
  VerifyCredentialsInput,
} from "../domain/user.repository.js";

const scryptAsync = promisify(crypto.scrypt);
import type { Pool, PoolClient } from "pg";
import {
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  type SessionTokens,
} from "../domain/session.js";

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
  constructor(
    @Inject(SQL_CLIENT) private readonly sql: SqlClient,
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
  ) {}

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

  async createSession(input: SessionTokens): Promise<{ expiresAt: number }> {
    const db = await this.pool.connect();
    try {
      await db.query("begin");
      const stored = await this.persistSession(
        db,
        input,
        crypto.randomUUID(),
        new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
      );
      await db.query("commit");
      return stored;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }

  async getRefreshUser(token: string): Promise<User | null> {
    const result = await this.sql.query<UserRow>(
      `select u.id::text, u.email::text, u.full_name, u.avatar_url, u.provider, u.created_at::text
       from users u join private.refresh_tokens r on r.user_id = u.id
       where r.token_hash = $1 and r.revoked_at is null and r.expires_at > now()`,
      [hashToken(token)],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async getSessionUser(token: string): Promise<User | null> {
    const result = await this.sql.query<UserRow>(
      `select u.id::text, u.email::text, u.full_name, u.avatar_url, u.provider, u.created_at::text
       from users u join user_sessions s on s.user_id = u.id
       where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now()`,
      [hashToken(token)],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async rotateSession(
    token: string,
    next: SessionTokens,
  ): Promise<{ expiresAt: number } | null> {
    const db = await this.pool.connect();
    try {
      await db.query("begin");
      // Share the user lock with password reset. Read token state AFTER acquiring it.
      await db.query("select id from users where id = $1 for update", [
        next.userId,
      ]);
      const result = await db.query(
        `select family_id, expires_at, consumed_at, revoked_at, expires_at > now() as active
         from private.refresh_tokens where token_hash = $1 and user_id = $2`,
        [hashToken(token), next.userId],
      );
      const current = result.rows[0];
      if (!current || current.revoked_at || !current.active) {
        await db.query("commit");
        return null;
      }
      if (current.consumed_at) {
        // Reuse indicates a stolen credential: invalidate every descendant.
        await this.revokeFamily(db, current.family_id);
        await db.query("commit");
        return null;
      }
      await db.query(
        "update private.refresh_tokens set consumed_at = now() where token_hash = $1",
        [hashToken(token)],
      );
      const stored = await this.persistSession(
        db,
        next,
        current.family_id,
        current.expires_at,
      );
      await db.query("commit");
      return stored;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }

  private async persistSession(
    db: PoolClient,
    input: SessionTokens,
    familyId: string,
    refreshExpiresAt: Date,
  ) {
    const expiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000);
    await db.query(
      "insert into user_sessions (user_id, token_hash, expires_at, family_id) values ($1, $2, $3, $4)",
      [input.userId, hashToken(input.token), expiresAt, familyId],
    );
    await db.query(
      "insert into private.refresh_tokens (token_hash, user_id, family_id, expires_at) values ($1, $2, $3, $4)",
      [hashToken(input.refreshToken), input.userId, familyId, refreshExpiresAt],
    );
    return { expiresAt: Math.floor(expiresAt.getTime() / 1000) };
  }

  private async revokeFamily(db: PoolClient, familyId: string) {
    await db.query(
      "update private.refresh_tokens set revoked_at = now() where family_id = $1 and revoked_at is null",
      [familyId],
    );
    await db.query(
      "update user_sessions set revoked_at = now() where family_id = $1 and revoked_at is null",
      [familyId],
    );
  }

  async revokeSession(token: string): Promise<void> {
    await this.revokeByHash("user_sessions", token);
  }

  async revokeRefreshSession(token: string): Promise<void> {
    await this.revokeByHash("private.refresh_tokens", token);
  }

  private async revokeByHash(
    table: "user_sessions" | "private.refresh_tokens",
    token: string,
  ) {
    const db = await this.pool.connect();
    try {
      await db.query("begin");
      // Serialize with rotation, otherwise a refresh could escape logout.
      await db.query(
        `select id from users where id = (select user_id from ${table} where token_hash = $1) for update`,
        [hashToken(token)],
      );
      const result = await db.query(
        `select family_id from ${table} where token_hash = $1`,
        [hashToken(token)],
      );
      if (result.rows[0]?.family_id)
        await this.revokeFamily(db, result.rows[0].family_id);
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
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

export async function hashPassword(password: string) {
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
