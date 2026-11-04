import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { Pool } from "pg";
import { POSTGRES_POOL } from "../../../database/database.tokens.js";
import {
  USER_REPOSITORY,
  type UserRepository,
} from "../domain/user.repository.js";
import type { User } from "../domain/user.entity.js";
import { logEvent } from "../../../observability/logger.js";

async function oauthStep<T>(stage: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    // Only standardized error codes, never provider bodies, messages or credentials.
    const candidate =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    const code =
      typeof candidate === "string" &&
      /^(?:[0-9A-Z]{5}|ERR_[A-Z_]{1,50})$/.test(candidate)
        ? candidate
        : "FAILED";
    logEvent("oauth.step_failed", "warn", { code: `GOOGLE_${stage}_${code}` });
    throw error;
  }
}

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { timeoutDuration: 5000 },
);
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
export function internalPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    /[\\\r\n\x00-\x20]/.test(value)
  )
    return "/plan";
  try {
    const url = new URL(value, "https://app.invalid");
    if (url.origin !== "https://app.invalid") return "/plan";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/plan";
  }
}
export class GoogleAuthError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function googleConfig() {
  if (process.env.GOOGLE_AUTH_ENABLED !== "true") return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  try {
    const redirect = new URL(process.env.GOOGLE_REDIRECT_URI ?? "");
    const local =
      process.env.NODE_ENV !== "production" &&
      redirect.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(redirect.hostname);
    if (
      !clientId ||
      !clientSecret ||
      (!local && redirect.protocol !== "https:") ||
      redirect.username ||
      redirect.password ||
      redirect.search ||
      redirect.hash ||
      redirect.pathname !== "/api/auth/google/callback"
    )
      return null;
    return { clientId, clientSecret, redirect };
  } catch {
    return null;
  }
}
export async function verifyGoogleToken(
  token: string,
  clientId: string,
  nonce: string,
  keys: JWTVerifyGetKey = googleKeys,
) {
  const { payload } = await jwtVerify(token, keys, {
    algorithms: ["RS256"],
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
    requiredClaims: ["sub", "exp", "iat", "nonce", "email"],
  });
  if (
    payload.nonce !== nonce ||
    payload.email_verified !== true ||
    typeof payload.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
    !payload.sub ||
    payload.sub.length > 255 ||
    (payload.azp !== undefined && payload.azp !== clientId)
  )
    throw new GoogleAuthError("google_invalid_token");
  return {
    subject: payload.sub,
    email: payload.email.trim().toLowerCase(),
    fullName:
      typeof payload.name === "string" ? payload.name.slice(0, 200) : null,
  };
}
type Transaction = {
  nonce: string;
  verifier: string;
  intent: "signin" | "link";
  user_id: string | null;
  session_hash: string | null;
  next_path: string;
};
type GoogleProfile = Awaited<ReturnType<typeof verifyGoogleToken>>;

@Injectable()
export class GoogleAuthService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async accountMethods(sessionToken: string) {
    const user = await this.users.getSessionUser(sessionToken);
    if (!user) throw new GoogleAuthError("google_reauth_required");
    const result = await this.pool.query<{
      googleLinked: boolean;
      hasPassword: boolean;
    }>(
      `select (u.password_hash is not null) as "hasPassword",
        exists(select 1 from auth_identities i where i.user_id=u.id and i.provider='google') as "googleLinked"
       from users u where u.id=$1`,
      [user.id],
    );
    if (!result.rows[0]) throw new GoogleAuthError("google_reauth_required");
    return { ...result.rows[0], googleEnabled: Boolean(googleConfig()) };
  }

  async start(
    input: { intent: "signin" | "link"; next?: string; password?: string },
    sessionToken?: string,
  ) {
    const config = googleConfig();
    if (!config) throw new GoogleAuthError("google_unavailable");
    let user: User | null = null;
    if (input.intent === "link") {
      user = sessionToken
        ? await this.users.getSessionUser(sessionToken)
        : null;
      if (!user || !input.password)
        throw new GoogleAuthError("google_reauth_required");
      const verified = await this.users.verifyLocalCredentials({
        email: user.email,
        password: input.password,
      });
      if (!verified || verified.id !== user.id)
        throw new GoogleAuthError("google_reauth_required");
    }
    const state = random(),
      browser = random(),
      nonce = random(),
      verifier = random();
    const ttl = input.intent === "link" ? 5 : 10;
    // Bound table growth without a separate paid cron/queue.
    await this.pool.query(
      "delete from oauth_transactions where state_hash in (select state_hash from oauth_transactions where expires_at < now() limit 100)",
    );
    await this.pool.query(
      `insert into oauth_transactions(state_hash,browser_hash,nonce,verifier,intent,user_id,session_hash,next_path,expires_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,now() + ($9 * interval '1 minute'))`,
      [
        digest(state),
        digest(browser),
        nonce,
        verifier,
        input.intent,
        user?.id ?? null,
        user ? digest(sessionToken!) : null,
        internalPath(input.next),
        ttl,
      ],
    );
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirect.href,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return { url: url.href, browser, maxAge: ttl * 60000 };
  }

  async finish(input: {
    state?: string;
    code?: string;
    error?: string;
    browser?: string;
    sessionToken?: string;
  }) {
    const config = googleConfig();
    if (!config) throw new GoogleAuthError("google_unavailable");
    if (
      !input.state ||
      !input.browser ||
      input.state.length > 128 ||
      input.browser.length > 128
    )
      throw new GoogleAuthError("google_invalid_state");
    // DELETE RETURNING atomically consumes a transaction, even on denial or bad code.
    const result = await this.pool.query<Transaction>(
      `delete from oauth_transactions where state_hash=$1 and browser_hash=$2 and expires_at > now() returning nonce,verifier,intent,user_id,session_hash,next_path`,
      [digest(input.state), digest(input.browser)],
    );
    const txn = result.rows[0];
    if (!txn) throw new GoogleAuthError("google_invalid_state");
    if (input.error) throw new GoogleAuthError("google_cancelled");
    if (!input.code || input.code.length > 4096)
      throw new GoogleAuthError("google_callback_error");
    if (
      txn.intent === "link" &&
      (!input.sessionToken || digest(input.sessionToken) !== txn.session_hash)
    )
      throw new GoogleAuthError("google_reauth_required");
    const authorizationCode = input.code;
    const response = await oauthStep("EXCHANGE", () =>
      fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        signal: AbortSignal.timeout(5000),
        redirect: "manual",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirect.href,
          code: authorizationCode,
          code_verifier: txn.verifier,
          grant_type: "authorization_code",
        }),
      }),
    );
    if (!response.ok) {
      logEvent("oauth.step_failed", "warn", {
        code: `GOOGLE_EXCHANGE_HTTP_${response.status}`,
      });
      throw new GoogleAuthError("google_callback_error");
    }
    const tokens = (await response.json()) as { id_token?: string };
    if (!tokens.id_token) throw new GoogleAuthError("google_invalid_token");
    const idToken = tokens.id_token;
    const profile = await oauthStep("VERIFY", () =>
      verifyGoogleToken(idToken, config.clientId, txn.nonce),
    );
    const user = await oauthStep("IDENTITY", () =>
      this.resolveIdentity(profile, txn),
    );
    return {
      user,
      next: internalPath(txn.next_path),
      linked: txn.intent === "link",
    };
  }

  async resolveIdentity(
    profile: GoogleProfile,
    txn: Transaction,
  ): Promise<User> {
    const db = await this.pool.connect();
    let userId: string;
    try {
      await db.query("begin");
      // Consistent lock order across login/link attempts for the same Google account.
      await db.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `google:${profile.subject}`,
      ]);
      const existing = await db.query<{ user_id: string }>(
        "select user_id from auth_identities where provider='google' and subject=$1",
        [profile.subject],
      );
      if (txn.intent === "link") {
        const current = await db.query<{ email: string }>(
          "select email from users where id=$1 for update",
          [txn.user_id],
        );
        const active = await db.query(
          "select 1 from user_sessions where token_hash=$1 and user_id=$2 and revoked_at is null and expires_at>now()",
          [txn.session_hash, txn.user_id],
        );
        if (
          !active.rowCount ||
          current.rows[0]?.email.toLowerCase() !== profile.email
        )
          throw new GoogleAuthError("google_link_mismatch");
        userId = txn.user_id!;
        if (existing.rows[0] && existing.rows[0].user_id !== userId)
          throw new GoogleAuthError("google_identity_in_use");
        const linked = await db.query<{ subject: string }>(
          "select subject from auth_identities where user_id=$1 and provider='google'",
          [userId],
        );
        if (linked.rows[0] && linked.rows[0].subject !== profile.subject)
          throw new GoogleAuthError("google_identity_in_use");
        if (!existing.rows[0])
          await db.query(
            "insert into auth_identities(user_id,provider,subject) values($1,'google',$2)",
            [userId, profile.subject],
          );
      } else if (existing.rows[0]) {
        userId = existing.rows[0].user_id;
      } else {
        const created = await db.query<{ id: string }>(
          `insert into users(email,password_hash,full_name,display_name,provider) values($1,null,$2,$2,'google') on conflict(email) do nothing returning id`,
          [profile.email, profile.fullName],
        );
        if (!created.rows[0]) throw new GoogleAuthError("google_link_required");
        userId = created.rows[0].id;
        await db.query(
          "insert into auth_identities(user_id,provider,subject) values($1,'google',$2)",
          [userId, profile.subject],
        );
      }
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
    const user = await this.users.getById(userId);
    if (!user) throw new GoogleAuthError("google_callback_error");
    return user;
  }
}
