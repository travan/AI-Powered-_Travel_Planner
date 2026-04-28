/**
 * Shared Supabase auth error normalization.
 * Maps raw Supabase AuthError → stable i18n keys consumed by both web and mobile.
 */

export interface NormalizedAuthError {
  /** Stable code used internally for logic branching. */
  code: string;
  /**
   * Dot-notation i18n key matching the "auth" namespace in messages/*.json.
   * e.g. "error_email_exists" → messages/en.json["auth"]["error_email_exists"]
   */
  i18nKey: string;
}

/** Minimal shape required from an error object – avoids importing Supabase types here. */
interface LikeAuthError {
  message?: string;
  status?: number;
  code?: string;
}

/**
 * Normalizes a Supabase AuthError into a stable code + i18n key pair.
 * Always returns a result – unknown errors fall back to "error_generic".
 */
export function normalizeSupabaseAuthError(error: LikeAuthError): NormalizedAuthError {
  const msg = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const status = error.status ?? 0;

  // ── Duplicate / already-registered ───────────────────────────────────────
  if (
    code === "user_already_exists" ||
    msg.includes("user already registered") ||
    msg.includes("already been registered") ||
    msg.includes("email already")
  ) {
    return { code: "email_exists", i18nKey: "error_email_exists" };
  }

  // ── Invalid email format ─────────────────────────────────────────────────
  if (
    code === "invalid_email" ||
    msg.includes("email address") && msg.includes("invalid") ||
    msg.includes("valid email")
  ) {
    return { code: "invalid_email", i18nKey: "error_invalid_email" };
  }

  // ── Wrong credentials ────────────────────────────────────────────────────
  if (
    code === "invalid_credentials" ||
    msg.includes("invalid login") ||
    msg.includes("invalid credentials") ||
    msg.includes("email not confirmed") ||
    (status === 400 && msg.includes("credentials"))
  ) {
    return { code: "invalid_credentials", i18nKey: "error_invalid_credentials" };
  }

  // ── Weak password ────────────────────────────────────────────────────────
  if (
    code === "weak_password" ||
    msg.includes("password") && msg.includes("weak") ||
    msg.includes("password should be") ||
    msg.includes("at least") && msg.includes("character")
  ) {
    return { code: "weak_password", i18nKey: "error_weak_password" };
  }

  // ── Session / token expired ──────────────────────────────────────────────
  if (
    code === "session_not_found" ||
    msg.includes("session") && msg.includes("expired") ||
    msg.includes("jwt expired") ||
    msg.includes("token is expired") ||
    status === 401
  ) {
    return { code: "session_expired", i18nKey: "error_session_expired" };
  }

  // ── Rate limiting ────────────────────────────────────────────────────────
  if (
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    status === 429
  ) {
    return { code: "rate_limited", i18nKey: "error_rate_limited" };
  }

  // ── OAuth / provider errors ──────────────────────────────────────────────
  if (
    msg.includes("provider") ||
    msg.includes("oauth") ||
    msg.includes("google")
  ) {
    return { code: "oauth_error", i18nKey: "google_error" };
  }

  // ── Configuration / environment ──────────────────────────────────────────
  if (msg.includes("supabase") && msg.includes("not configured")) {
    return { code: "config_missing", i18nKey: "error_config_missing" };
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  return { code: "unknown", i18nKey: "error_generic" };
}
