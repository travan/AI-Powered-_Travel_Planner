/**
 * Google OAuth flow — contract tests (mock-auth mode)
 *
 * Covers:
 *   1. Click Google → mock OAuth → /auth/callback intercept → session injected → land on /plan
 *   2. Google OAuth with a custom `next` param (e.g. /saved) → land on /saved
 *   3. /auth/callback with no `code` param → /login?error=auth_callback_error  (real route behaviour)
 */
import { expect, test } from "./helpers/test-fixtures";
import {
  clearWebMockAuthSession,
  triggerGoogleOAuthOnWeb,
} from "./helpers/e2e-helpers";

test.describe("web Google OAuth flow", () => {
  test.beforeEach(async ({ page }) => {
    // Start each test unauthenticated
    await page.goto("/login");
    await clearWebMockAuthSession(page);
  });

  test("Google sign-in on /login → lands on /plan with active session", async ({ page }) => {
    await page.goto("/login");

    await triggerGoogleOAuthOnWeb(page, "login", "/plan");

    // Should land on /plan (not on /login or /auth/callback)
    await expect(page).toHaveURL(/\/plan$/, { timeout: 15_000 });

    // Session should be active: mock auth persists in localStorage
    const session = await page.evaluate(() =>
      window.localStorage.getItem("horizon.mock.auth.session"),
    );
    expect(session).not.toBeNull();
    const parsed = JSON.parse(session!);
    expect(parsed.user.email).toBe("google.traveler@horizon.mock");
  });

  test("Google sign-in with redirectTo=/saved → preserves the next param and lands on /saved", async ({
    page,
  }) => {
    // Visit login with a redirectTo query param — simulates the protected-route redirect
    await page.goto("/login?redirectTo=%2Fsaved");

    // The AuthExperience component reads redirectTo and embeds it into the callbackUrl
    await triggerGoogleOAuthOnWeb(page, "login", "/saved");

    await expect(page).toHaveURL(/\/saved$/, { timeout: 15_000 });
  });

  test("Google sign-in on /signup tab → lands on /plan", async ({ page }) => {
    await page.goto("/signup");

    await triggerGoogleOAuthOnWeb(page, "signup", "/plan");

    await expect(page).toHaveURL(/\/plan$/, { timeout: 15_000 });
  });

  test("/auth/callback with no code → redirects to /login with error flag", async ({ page }) => {
    // Navigate directly to the callback route without a code param.
    // This exercises the real Next.js route handler (no mock needed).
    // The handler should redirect to /login?error=auth_callback_error.
    await page.goto("/auth/callback");

    await expect(page).toHaveURL(/\/login\?error=auth_callback_error/, { timeout: 15_000 });
  });
});
