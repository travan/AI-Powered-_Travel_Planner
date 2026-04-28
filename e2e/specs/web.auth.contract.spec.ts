import { expect, test } from "@playwright/test";
import { queuedScenario, cachedScenario } from "../fixtures/index.mjs";
import {
  clearWebMockAuthSession,
  expectTripsOverviewPage,
  clickDetailFromTripsOverview,
  expectItineraryPage,
  searchAndGenerate,
  signInOnWeb,
  signUpOnWeb,
  searchCity,
  clickGenerate,
  openPlanPage,
} from "./helpers/e2e-helpers";

function createAuthIdentity() {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    fullName: "Elias Horizon",
    email: `traveler.${token}@horizon.mock`,
    password: "secret123",
  };
}

test.describe("web auth contract flows", () => {
  test("protected saved route redirects to auth and signup preserves the redirect target", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/saved");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fsaved/);

    await page.getByTestId("web-auth-tab-signup").click();
    await expect(page).toHaveURL(/\/signup\?redirectTo=%2Fsaved/);

    await signUpOnWeb(page, identity);

    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.getByTestId("web-saved-page-title")).toHaveText("Your saved escapes");
    await expect(page.getByTestId("web-saved-page-state")).toContainText(identity.email);
  });

  test("unauthenticated user trying to generate redirects to login with resumeGenerate flag", async ({
    page,
  }) => {
    const identity = createAuthIdentity();

    // First, sign up a new user to establish the account
    await page.goto("/signup");
    await signUpOnWeb(page, identity);
    await expect(page).toHaveURL(/\/plan$/);

    // Clear auth session to simulate returning after closing browser
    await clearWebMockAuthSession(page);

    // Now try to generate without auth
    await searchCity(page, queuedScenario.city);
    await clickGenerate(page);

    // Should redirect to login with resumeGenerate flag
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fplan%3FresumeGenerate%3D1/);

    // Sign in with the account we just created
    await signInOnWeb(page, identity);

    // After login, should auto-resume and redirect to /trips
    await expectTripsOverviewPage(page);

    // Should be able to navigate to detail from overview
    await clickDetailFromTripsOverview(page);
    await expectItineraryPage(page, queuedScenario.itineraryId, queuedScenario.itinerary.itineraries[0].title);
  });

  test("signup flow with resume generate continues to trips overview", async ({ page }) => {
    const identity = createAuthIdentity();

    await openPlanPage(page);
    await clearWebMockAuthSession(page);

    await searchCity(page, cachedScenario.city);
    await clickGenerate(page);

    // Should redirect to login
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fplan%3FresumeGenerate%3D1/);

    // Switch to signup
    await page.getByTestId("web-auth-tab-signup").click();
    await expect(page).toHaveURL(/\/signup\?redirectTo=%2Fplan%3FresumeGenerate%3D1/);

    await signUpOnWeb(page, identity);

    // After signup, should auto-resume and redirect to /trips
    await expectTripsOverviewPage(page);

    // Should be able to navigate to detail from overview
    await clickDetailFromTripsOverview(page);
    await expectItineraryPage(page, cachedScenario.itineraryId, cachedScenario.itinerary.itineraries[0].title);
  });

  test("verify-email page renders email and resend button", async ({ page }) => {
    const email = "traveler@horizon.mock";
    await page.goto(`/verify-email?email=${encodeURIComponent(email)}`);

    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole("button", { name: /resend/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /back to sign in/i })).toHaveAttribute(
      "href",
      "/login"
    );
  });

  test("sign out from account menu redirects to login", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/signup");
    await signUpOnWeb(page, identity);
    await expect(page).toHaveURL(/\/plan$/);

    // Open account menu and sign out
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menuitem", { name: /sign out/i })).toBeVisible();
    await page.getByRole("menuitem", { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/login/);
  });

  test("login continues into the itinerary generation flow", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/signup");
    await signUpOnWeb(page, identity);
    await expect(page).toHaveURL(/\/plan$/);

    await clearWebMockAuthSession(page);

    await page.goto("/login?redirectTo=/plan");
    await signInOnWeb(page, identity);
    await expect(page).toHaveURL(/\/plan$/);

    await searchAndGenerate(page, queuedScenario.city);
    await expectTripsOverviewPage(page);
    await clickDetailFromTripsOverview(page);
    await expectItineraryPage(
      page,
      queuedScenario.itineraryId,
      queuedScenario.itinerary.itineraries[0].title
    );
  });
});