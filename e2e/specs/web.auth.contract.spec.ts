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
  test("protected saved route redirects to auth and signup preserves the redirect target", async ({
    page,
  }) => {
    const identity = createAuthIdentity();

    await page.goto("/saved");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fsaved/);

    await page.getByTestId("web-auth-tab-signup").click();
    await expect(page).toHaveURL(/\/signup\?redirectTo=%2Fsaved/);

    await signUpOnWeb(page, identity);

    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.getByTestId("web-saved-page-title")).toHaveText(
      "Your saved escapes",
    );
    await expect(page.getByTestId("web-saved-page-state")).toContainText(
      identity.email,
    );
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
    await expect(page).toHaveURL(
      /\/login\?redirectTo=%2Fplan%3FresumeGenerate%3D1/,
    );

    // Sign in with the account we just created
    await signInOnWeb(page, identity);

    // After login, should auto-resume and redirect to /trips
    await expectTripsOverviewPage(page);

    // Should be able to navigate to detail from overview
    await clickDetailFromTripsOverview(page);
    await expectItineraryPage(
      page,
      queuedScenario.itineraryId,
      queuedScenario.itinerary.itineraries[0].title,
    );
  });

  test("stale auth token redirects to login instead of showing a 401 error", async ({
    page,
  }) => {
    const identity = createAuthIdentity();

    await page.goto("/signup");
    await signUpOnWeb(page, identity);
    await expect(page).toHaveURL(/\/plan$/);

    await page.route("**/api/itinerary/generate", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          statusCode: 401,
          message: "Invalid or missing token",
        }),
      });
    });

    await searchCity(page, queuedScenario.city);
    await clickGenerate(page);

    await expect(page).toHaveURL(
      /\/login\?redirectTo=%2Fplan%3FresumeGenerate%3D1/,
    );
    await expect(page.getByText("Generate failed: 401")).not.toBeVisible();
  });

  test("signup flow with resume generate continues to trips overview", async ({
    page,
  }) => {
    const identity = createAuthIdentity();

    await openPlanPage(page);
    await clearWebMockAuthSession(page);

    await searchCity(page, cachedScenario.city);
    await clickGenerate(page);

    // Should redirect to login
    await expect(page).toHaveURL(
      /\/login\?redirectTo=%2Fplan%3FresumeGenerate%3D1/,
    );

    // Switch to signup
    await page.getByTestId("web-auth-tab-signup").click();
    await expect(page).toHaveURL(
      /\/signup\?redirectTo=%2Fplan%3FresumeGenerate%3D1/,
    );

    await signUpOnWeb(page, identity);

    // After signup, should auto-resume and redirect to /trips
    await expectTripsOverviewPage(page);

    // Should be able to navigate to detail from overview
    await clickDetailFromTripsOverview(page);
    await expectItineraryPage(
      page,
      cachedScenario.itineraryId,
      cachedScenario.itinerary.itineraries[0].title,
    );
  });

  test("verify-email page renders email and resend button", async ({
    page,
  }) => {
    const email = "traveler@horizon.mock";
    await page.goto(`/verify-email?email=${encodeURIComponent(email)}`);

    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByRole("button", { name: /resend/i })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /back to sign in/i }),
    ).toHaveAttribute("href", "/login");
  });

  test("password recovery updates the password and allows sign-in with the new one", async ({
    page,
  }) => {
    const identity = createAuthIdentity();
    const newPassword = "Horizon-Recovered-456!";

    await page.goto("/signup");
    await signUpOnWeb(page, identity);
    await expect(page).toHaveURL(/\/plan$/);
    await clearWebMockAuthSession(page);

    await page.goto("/login");
    await page.getByTestId("web-auth-email").fill(identity.email);
    await page.getByTestId("web-auth-password").focus();
    await expect(
      page.getByTestId("web-auth-account-checking"),
    ).not.toBeVisible();
    await page.getByTestId("web-auth-forgot-password").click();
    await expect(page.getByTestId("web-auth-success")).toContainText(
      /password reset email sent/i,
    );

    // The mock provider creates the recovery session an emailed link would
    // establish when the user opens /reset-password.
    await page.goto("/reset-password");
    const submit = page.getByTestId("reset-password-submit");
    await expect(submit).toBeEnabled();

    await page.getByTestId("reset-password-new-password").fill(newPassword);
    await page
      .getByTestId("reset-password-confirm-password")
      .fill(`${newPassword}-mismatch`);
    await submit.click();
    await expect(page.getByTestId("reset-password-error")).toContainText(
      "Passwords do not match",
    );

    await page.getByTestId("reset-password-confirm-password").fill(newPassword);
    await submit.click();
    await expect(page.getByTestId("reset-password-success")).toContainText(
      "Password updated successfully",
    );
    await expect(page).toHaveURL(/\/plan$/, { timeout: 5_000 });
    await clearWebMockAuthSession(page);
    await page.goto("/login");

    await page.getByTestId("web-auth-email").fill(identity.email);
    await page.getByTestId("web-auth-password").fill(identity.password);
    await page.getByTestId("web-auth-submit-login").click();
    await expect(page.getByTestId("web-auth-error")).toBeVisible();

    await page.getByTestId("web-auth-password").fill(newPassword);
    await page.getByTestId("web-auth-submit-login").click();
    await expect(page).toHaveURL(/\/plan$/);
  });

  test("sign out from account menu redirects to login", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/signup");
    await signUpOnWeb(page, identity);
    await expect(page).toHaveURL(/\/plan$/);

    // Open account menu and sign out
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(
      page.getByRole("menuitem", { name: /my trips/i }),
    ).toHaveAttribute("href", "/trips");
    await expect(
      page.getByRole("menuitem", { name: /sign out/i }),
    ).toBeVisible();
    await page.getByRole("menuitem", { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/login/);
  });

  test("signed-out account menu offers sign in instead of sign out", async ({
    page,
  }) => {
    await page.goto("/plan");
    await clearWebMockAuthSession(page);
    await page.reload();

    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(
      page.getByRole("menuitem", { name: /sign in/i }),
    ).toHaveAttribute("href", /\/login\?redirectTo=%2Fplan/);
    await expect(page.getByRole("menuitem", { name: /sign out/i })).toHaveCount(
      0,
    );
  });

  test("login continues into the itinerary generation flow", async ({
    page,
  }) => {
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
      queuedScenario.itinerary.itineraries[0].title,
    );
  });
});

test("missing server draft falls back to browser intent and does not repeat claim on reload", async ({
  page,
}) => {
  await page.goto("/signup");
  await signUpOnWeb(page, createAuthIdentity());
  await expect(page).toHaveURL(/\/plan$/);
  await page.evaluate(() => {
    const planning = JSON.parse(
      localStorage.getItem("horizon.planner.draft.v3")!,
    ).planning;
    planning.journey.origin.label = "Hà Nội";
    planning.journey.destinations = ["tokyo"];
    sessionStorage.setItem(
      "horizon.search.intent",
      JSON.stringify({
        request: {
          planning,
          cities: ["tokyo"],
          city_names: ["Tokyo"],
          num_days: 3,
          budget: 1200,
          currency: "USD",
          trip_style: "mid_range",
          num_travelers: 2,
          locale: "en",
        },
        draftId: "missing-draft",
        guestKey: "guest-test-key",
        createdAt: Date.now(),
      }),
    );
  });
  let claims = 0;
  let generations = 0;
  await page.route("**/api/search-drafts/*/claim", async (route) => {
    claims++;
    await route.fulfill({
      status: 404,
      json: { message: "Search draft not found or expired" },
    });
  });
  await page.route("**/api/itinerary/generate", async (route) => {
    generations++;
    expect(route.request().postDataJSON()).toMatchObject({
      cities: ["tokyo"],
      num_days: 3,
    });
    await route.fulfill({
      status: 503,
      json: { message: "AI temporarily unavailable" },
    });
  });
  await page.goto("/plan?resumeGenerate=1&draftId=missing-draft");
  await expect(
    page.locator('[data-testid="web-plan-error"]:visible'),
  ).toHaveText(
    "The planning service is unavailable. Your details have been kept.",
  );
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByTestId("web-plan-selected-city")).toContainText(
    "Tokyo",
  );
  expect(claims).toBe(1);
  expect(generations).toBe(1);
  await page.reload();
  await expect(page.getByText("Claim search draft failed: 404")).toHaveCount(0);
  expect(claims).toBe(1);
  expect(generations).toBe(1);
});

test("missing draft without a browser copy clears stale resume parameters", async ({
  page,
}) => {
  await page.goto("/signup");
  await signUpOnWeb(page, createAuthIdentity());
  await expect(page).toHaveURL(/\/plan$/);
  await page.evaluate(() => {
    sessionStorage.removeItem("horizon.search.intent");
    localStorage.setItem("horizon.search.guest_key", "guest-test-key");
  });
  let claims = 0;
  await page.route("**/api/search-drafts/*/claim", async (route) => {
    claims++;
    await route.fulfill({ status: 404, json: {} });
  });
  await page.goto("/plan?resumeGenerate=1&draftId=missing-draft");
  await expect(
    page.locator('[data-testid="web-plan-error"]:visible'),
  ).toHaveText(
    "Your saved search is no longer available. Please choose a destination and try again.",
  );
  await expect(page).toHaveURL(/\/plan$/);
  await page.reload();
  await expect(
    page.getByText(
      "Your saved search is no longer available. Please choose a destination and try again.",
    ),
  ).toHaveCount(0);
  expect(claims).toBe(1);
});
