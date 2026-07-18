import { describe, expect, it } from "vitest";
import { normalizeSupabaseAuthError } from "../../../../../packages/types/src/auth-errors";

describe("normalizeSupabaseAuthError", () => {
  // ── email_exists ────────────────────────────────────────────────────────
  it("detects user_already_exists code", () => {
    const result = normalizeSupabaseAuthError({ code: "user_already_exists" });
    expect(result.code).toBe("email_exists");
    expect(result.i18nKey).toBe("error_email_exists");
  });

  it("detects 'User already registered' message", () => {
    const result = normalizeSupabaseAuthError({ message: "User already registered" });
    expect(result.code).toBe("email_exists");
  });

  it("detects 'email already' message variant", () => {
    const result = normalizeSupabaseAuthError({ message: "This email already exists" });
    expect(result.code).toBe("email_exists");
  });

  // ── invalid_email ────────────────────────────────────────────────────────
  it("detects invalid_email code", () => {
    const result = normalizeSupabaseAuthError({ code: "invalid_email" });
    expect(result.code).toBe("invalid_email");
    expect(result.i18nKey).toBe("error_invalid_email");
  });

  it("detects 'email address ... is invalid' message", () => {
    const result = normalizeSupabaseAuthError({
      message: 'Email address "test123@gmail.com" is invalid',
    });
    expect(result.code).toBe("invalid_email");
  });

  // ── invalid_credentials ──────────────────────────────────────────────────
  it("detects invalid_credentials code", () => {
    const result = normalizeSupabaseAuthError({ code: "invalid_credentials" });
    expect(result.code).toBe("invalid_credentials");
    expect(result.i18nKey).toBe("error_invalid_credentials");
  });

  it("detects 'Invalid login credentials' message", () => {
    const result = normalizeSupabaseAuthError({ message: "Invalid login credentials" });
    expect(result.code).toBe("invalid_credentials");
  });

  it("detects 'invalid credentials' message", () => {
    const result = normalizeSupabaseAuthError({ message: "invalid credentials" });
    expect(result.code).toBe("invalid_credentials");
  });

  // ── weak_password ────────────────────────────────────────────────────────
  it("detects weak_password code", () => {
    const result = normalizeSupabaseAuthError({ code: "weak_password" });
    expect(result.code).toBe("weak_password");
    expect(result.i18nKey).toBe("error_weak_password");
  });

  it("detects 'Password should be at least' message", () => {
    const result = normalizeSupabaseAuthError({
      message: "Password should be at least 6 characters",
    });
    expect(result.code).toBe("weak_password");
  });

  it("detects 'password weak' message", () => {
    const result = normalizeSupabaseAuthError({ message: "password is too weak" });
    expect(result.code).toBe("weak_password");
  });

  // ── session_expired ──────────────────────────────────────────────────────
  it("detects session_not_found code", () => {
    const result = normalizeSupabaseAuthError({ code: "session_not_found" });
    expect(result.code).toBe("session_expired");
    expect(result.i18nKey).toBe("error_session_expired");
  });

  it("detects JWT expired message", () => {
    const result = normalizeSupabaseAuthError({ message: "JWT expired" });
    expect(result.code).toBe("session_expired");
  });

  it("detects HTTP 401 status", () => {
    const result = normalizeSupabaseAuthError({ status: 401 });
    expect(result.code).toBe("session_expired");
  });

  // ── rate_limited ─────────────────────────────────────────────────────────
  it("detects 'rate limit' message", () => {
    const result = normalizeSupabaseAuthError({ message: "rate limit exceeded" });
    expect(result.code).toBe("rate_limited");
    expect(result.i18nKey).toBe("error_rate_limited");
  });

  it("detects HTTP 429 status", () => {
    const result = normalizeSupabaseAuthError({ status: 429 });
    expect(result.code).toBe("rate_limited");
  });

  it("detects 'too many requests' message", () => {
    const result = normalizeSupabaseAuthError({ message: "too many requests" });
    expect(result.code).toBe("rate_limited");
  });

  // ── oauth_error ──────────────────────────────────────────────────────────
  it("detects OAuth provider error", () => {
    const result = normalizeSupabaseAuthError({ message: "OAuth provider error" });
    expect(result.code).toBe("oauth_error");
    expect(result.i18nKey).toBe("google_error");
  });

  it("detects google message", () => {
    const result = normalizeSupabaseAuthError({ message: "google sign in failed" });
    expect(result.code).toBe("oauth_error");
  });

  // ── config_missing ────────────────────────────────────────────────────────
  it("detects supabase not configured message", () => {
    const result = normalizeSupabaseAuthError({
      message: "supabase is not configured",
    });
    expect(result.code).toBe("config_missing");
    expect(result.i18nKey).toBe("error_config_missing");
  });

  // ── fallback ──────────────────────────────────────────────────────────────
  it("falls back to unknown for unrecognized errors", () => {
    const result = normalizeSupabaseAuthError({ message: "some totally unknown error" });
    expect(result.code).toBe("unknown");
    expect(result.i18nKey).toBe("error_generic");
  });

  it("falls back to unknown for empty error object", () => {
    const result = normalizeSupabaseAuthError({});
    expect(result.code).toBe("unknown");
  });

  it("handles missing message and code gracefully", () => {
    const result = normalizeSupabaseAuthError({ status: 500 });
    expect(result.code).toBe("unknown");
  });

  // ── return shape ──────────────────────────────────────────────────────────
  it("always returns an object with code and i18nKey", () => {
    const result = normalizeSupabaseAuthError({});
    expect(result).toHaveProperty("code");
    expect(result).toHaveProperty("i18nKey");
    expect(typeof result.code).toBe("string");
    expect(typeof result.i18nKey).toBe("string");
  });
});
