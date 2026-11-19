import { expect, test } from "./helpers/test-fixtures";
import { queuedScenario, cachedScenario } from "../fixtures/index.mjs";
import {
  signInOnMobileWeb,
  signUpOnMobileWeb,
  searchCityOnMobileWeb,
  clickGenerateOnMobileWeb,
  expectTripsOverviewPageMobile,
  clickDetailFromTripsOverviewMobile,
  expectItineraryPageMobile,
  clearMobileWebMockAuthSession,
  MOBILE_AUTH_TOGGLE_LOGIN,
} from "./helpers/e2e-helpers";

function createAuthIdentity() {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    fullName: "Elias Horizon",
    email: `mobile.${token}@horizon.mock`,
    password: "secret123",
  };
}

test.describe("mobile web auth contract flows", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
  });

  test("signup then login unlocks profile and saved routes", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/signup");
    await signUpOnMobileWeb(page, identity);
    if (/\/login$/.test(page.url())) {
      await signInOnMobileWeb(page, identity);
    }

    await page.goto("/profile");
    await expect(page.getByTestId("mobile-profile-name")).toBeVisible();

    await page.goto("/saved");
    await expect(page.getByText("Kyoto Cultural Escape")).toBeVisible();
  });

  test("login restores access to the signed-in mobile experience", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/signup");
    await signUpOnMobileWeb(page, identity);
    if (/\/login$/.test(page.url())) {
      await signInOnMobileWeb(page, identity);
    }

    await page.goto("/profile");
    await page.getByTestId("mobile-profile-signout").click();
    await expect(page.getByTestId("mobile-profile-state")).toHaveText("Not signed in");

    await page.goto("/login");
    await signInOnMobileWeb(page, identity);

    await page.goto("/profile");
    await expect(page.getByTestId("mobile-profile-name")).toBeVisible();
    await expect(page.getByTestId("mobile-profile-email")).toHaveText(identity.email);
  });

  test("forgot password confirms that a reset email was requested", async ({ page }) => {
    const identity = createAuthIdentity();
    await page.goto("/signup");
    await signUpOnMobileWeb(page, identity);
    await clearMobileWebMockAuthSession(page);

    await page.goto("/login");
    await page.getByTestId("mobile-auth-email").fill(identity.email);
    await page.getByTestId("mobile-auth-forgot-password").click();
    await expect(page.getByTestId("mobile-auth-reset-feedback-title")).toHaveText("Reset sent");
    await expect(page.getByTestId("mobile-auth-reset-feedback-message")).toContainText(
      "If an account exists for this email",
    );
  });

  test("unauthenticated mobile user trying to generate redirects to login", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/signup");
    await signUpOnMobileWeb(page, identity);
    if (/\/login$/.test(page.url())) {
      await signInOnMobileWeb(page, identity);
    }

    // Clear auth session from both cookies and localStorage
    await clearMobileWebMockAuthSession(page);

    await page.goto("/plan");
    await searchCityOnMobileWeb(page, queuedScenario.city);
    await clickGenerateOnMobileWeb(page);

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);

    await signInOnMobileWeb(page, identity);

    // After login, should auto-resume and redirect to /trips
    await expectTripsOverviewPageMobile(page);

    // Should be able to navigate to detail
    await clickDetailFromTripsOverviewMobile(page);
    await expectItineraryPageMobile(page, queuedScenario.itineraryId, queuedScenario.itinerary.itineraries[0].title);
  });

  test("mobile signup flow with generate continues to trips overview", async ({ page }) => {
    const identity = createAuthIdentity();

    // Clear auth session from both cookies and localStorage
    await page.goto("/");
    await clearMobileWebMockAuthSession(page);

    await page.goto("/plan");
    await searchCityOnMobileWeb(page, cachedScenario.city);
    await clickGenerateOnMobileWeb(page);

    // Should redirect to login/signup
    await expect(page).toHaveURL(/\/login/);

    // Switch to signup if available
    const signupToggle = page.getByTestId(MOBILE_AUTH_TOGGLE_LOGIN);
    if (await signupToggle.isVisible()) {
      await signupToggle.click();
    }

    await signUpOnMobileWeb(page, identity);

    // After signup, should auto-resume and redirect to /trips
    await expectTripsOverviewPageMobile(page);

    // Should be able to navigate to detail
    await clickDetailFromTripsOverviewMobile(page);
    await expectItineraryPageMobile(page, cachedScenario.itineraryId, cachedScenario.itinerary.itineraries[0].title);
  });
});
