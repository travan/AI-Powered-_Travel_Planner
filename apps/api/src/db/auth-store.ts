import crypto from "node:crypto";
import { promisify } from "node:util";
import { query } from "./postgres.js";

const scryptAsync = promisify(crypto.scrypt);
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type AuthUser = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  provider: string;
  created_at: string;
};

type UserWithPassword = AuthUser & {
  password_hash: string;
};

export async function createLocalUser(input: {
  email: string;
  password: string;
  fullName?: string;
}): Promise<AuthUser> {
  const passwordHash = await hashPassword(input.password);
  const result = await query<AuthUser>(
    `insert into users (email, password_hash, full_name, provider)
     values ($1, $2, $3, 'local')
     returning id::text, email::text, full_name, avatar_url, provider, created_at::text`,
    [normalizeEmail(input.email), passwordHash, input.fullName?.trim() || null]
  );

  return result.rows[0]!;
}

export async function verifyLocalUserCredentials(input: {
  email: string;
  password: string;
}): Promise<AuthUser | null> {
  const result = await query<UserWithPassword>(
    `select id::text, email::text, password_hash, full_name, avatar_url, provider, created_at::text
     from users
     where email = $1
     limit 1`,
    [normalizeEmail(input.email)]
  );
  const user = result.rows[0];
  if (!user) return null;

  const ok = await verifyPassword(input.password, user.password_hash);
  if (!ok) return null;

  const { password_hash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const result = await query<AuthUser>(
    `select id::text, email::text, full_name, avatar_url, provider, created_at::text
     from users
     where id = $1
     limit 1`,
    [userId]
  );

  return result.rows[0] ?? null;
}

export async function userExistsByEmail(email: string): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    "select exists(select 1 from users where email = $1) as exists",
    [normalizeEmail(email)]
  );

  return Boolean(result.rows[0]?.exists);
}

export async function createUserSession(input: {
  userId: string;
  token: string;
}): Promise<{ expiresAt: number }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await query(
    `insert into user_sessions (user_id, token_hash, expires_at)
     values ($1, $2, $3)`,
    [input.userId, hashToken(input.token), expiresAt]
  );

  return { expiresAt: Math.floor(expiresAt.getTime() / 1000) };
}

export async function revokeUserSession(token: string): Promise<void> {
  await query(
    `update user_sessions
     set revoked_at = now()
     where token_hash = $1 and revoked_at is null`,
    [hashToken(token)]
  );
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, salt, key] = storedHash.split("$");
  if (algorithm !== "scrypt" || !salt || !key) return false;

  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(key, "hex");
  if (storedKey.length !== derivedKey.length) return false;

  return crypto.timingSafeEqual(storedKey, derivedKey);
}
