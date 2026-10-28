import { expect, Page, APIRequestContext } from "@playwright/test";

export const API_BASE_URL = `http://127.0.0.1:${process.env.E2E_MOCK_API_PORT ?? "3301"}`;
export const WEB_PLAN_CITY_INPUT = "web-plan-city-input";
export const WEB_PLAN_GENERATE_BUTTON =
  "[data-testid='web-plan-generate']:visible";
export const WEB_ITINERARY_TITLE = "web-itinerary-title";
export const WEB_GENERATING_SCREEN = "web-generating-screen";
export const WEB_TRIPS_OVERVIEW_CARD = "web-trips-overview-card";
export const WEB_TRIPS_DETAIL_LINK = "web-trips-detail-link";
export const WEB_AUTH_EMAIL = "web-auth-email";
export const WEB_AUTH_PASSWORD = "web-auth-password";
export const WEB_AUTH_FULL_NAME = "web-auth-full-name";
export const MOBILE_AUTH_TOGGLE_LOGIN = "mobile-auth-toggle-login";
export const MOBILE_AUTH_TOGGLE_SIGNUP = "mobile-auth-toggle-signup";
const MOBILE_ASSERT_TIMEOUT_MS = 30_000;
const WEB_NAVIGATION_TIMEOUT_MS = 20_000;

export function apiAuthHeaders(token = "Bearer e2e-user-1") {
  return { Authorization: token };
}

export function apiJsonHeaders(token = "Bearer e2e-user-1") {
  return {
    Authorization: token,
    "Content-Type": "application/json",
  };
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function openPlanPage(page: Page) {
  await page.goto("/plan");
}

export async function clearWebMockAuthSession(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem("horizon.mock.auth.session");
    window.localStorage.removeItem("horizon.local.auth.session");
    window.localStorage.removeItem("horizon.e2e.signup.force_error");
    document.cookie = "horizon_mock_auth=; Path=/; Max-Age=0; SameSite=Lax";
    document.cookie = "horizon_local_auth=; Path=/; Max-Age=0; SameSite=Lax";
  });
  // Clear context cookies last so an active page cannot rehydrate the old
  // localStorage session back into a server-readable cookie between steps.
  await page.context().clearCookies();
}

/**
 * Simulates a full Google OAuth flow in mock-auth mode.
 *
 * In mock mode, `signInWithOAuth` synchronously:
 *   1. Creates the user and stores the session in localStorage
 *   2. Returns `{ data: { url: callbackUrl } }`
 * The component then calls `window.location.assign(callbackUrl)`.
 *
 * Because the Next.js callback route requires a real `code` param, we intercept
 * the navigation with `page.route()` and redirect to the landing path. The session
 * is already in localStorage from step 1, so no additional injection is needed.
 *
 * NOTE: Do NOT call `page.evaluate` before the click to pre-inject the session —
 * it would cause the auth page to navigate away before the button can be clicked.
 *
 * @param page        Playwright Page
 * @param mode        "login" | "signup" — matches the data-testid of the Google button
 * @param landingPath The path the user should land on after OAuth (default "/plan")
 */
export async function triggerGoogleOAuthOnWeb(
  page: Page,
  mode: "login" | "signup" = "login",
  landingPath = "/plan",
) {
  const baseUrl = new URL(page.url()).origin;

  // Intercept the /auth/callback navigation triggered by mock signInWithOAuth.
  // The mock already sets the session in localStorage before window.location.assign
  // fires, so we just need to redirect to the landing path.
  await page.route("**/auth/callback**", async (route) => {
    const url = new URL(route.request().url());
    const next = url.searchParams.get("next") ?? landingPath;
    const target =
      next.startsWith("/") && !next.startsWith("//") ? next : landingPath;
    await route.fulfill({
      status: 302,
      headers: { Location: `${baseUrl}${target}` },
    });
  });

  await page.getByTestId(`web-auth-google-${mode}`).click();

  // Clean up the route. Use unrouteAll with ignoreErrors because the page may
  // have already navigated away by the time this line executes.
  await page.unrouteAll({ behavior: "ignoreErrors" });
}

export async function injectWebMockAuthSession(
  page: Page,
  userId = "e2e-trips-user",
) {
  const session = await page.evaluate((uid) => {
    const session = {
      access_token: `mock-access-mock-${uid}`,
      refresh_token: `mock-refresh-mock-${uid}`,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: `mock-${uid}`,
        email: `${uid}@test.com`,
        user_metadata: {},
      },
    };
    window.localStorage.setItem(
      "horizon.mock.auth.session",
      JSON.stringify(session),
    );
    window.localStorage.removeItem("horizon.local.auth.session");
    document.cookie = `horizon_mock_auth=${encodeURIComponent(JSON.stringify(session))}; Path=/; Max-Age=86400; SameSite=Lax`;
    document.cookie = "horizon_local_auth=; Path=/; Max-Age=0; SameSite=Lax";
    return session;
  }, userId);
  await page.context().addCookies([
    {
      name: "horizon_mock_auth",
      value: encodeURIComponent(JSON.stringify(session)),
      url: new URL(page.url()).origin,
      sameSite: "Lax",
    },
  ]);
}

export async function clearMobileWebMockAuthSession(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem("horizon.mobile.mock.session");
    window.localStorage.removeItem("horizon.mobile.search.intent");
  });
  await page.context().clearCookies();
}

export async function injectMobileMockAuthSession(
  page: Page,
  userId = "e2e-trips-user",
) {
  await page.evaluate((uid) => {
    const session = {
      access_token: `mock-mobile-access-mock-${uid}`,
      refresh_token: `mock-refresh-mock-${uid}`,
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: `mock-${uid}`,
        email: `${uid}@test.com`,
        user_metadata: {},
      },
    };
    window.localStorage.setItem(
      "horizon.mobile.mock.session",
      JSON.stringify(session),
    );
  }, userId);
}

export async function signUpOnWeb(
  page: Page,
  details: { fullName: string; email: string; password: string },
) {
  await page.getByTestId(WEB_AUTH_FULL_NAME).fill(details.fullName);
  await page.getByTestId(WEB_AUTH_EMAIL).fill(details.email);
  await page.getByTestId(WEB_AUTH_PASSWORD).fill(details.password);
  await page.getByTestId("web-auth-submit-signup").click();
}

export async function signInOnWeb(
  page: Page,
  details: { email: string; password: string },
) {
  await page.getByTestId(WEB_AUTH_EMAIL).fill(details.email);
  await page.getByTestId(WEB_AUTH_PASSWORD).fill(details.password);
  await page.getByTestId("web-auth-submit-login").click();
}

export async function signUpOnMobileWeb(
  page: Page,
  details: { fullName: string; email: string; password: string },
) {
  await page.getByTestId("mobile-auth-full-name").fill(details.fullName);
  await page.getByTestId("mobile-auth-email").fill(details.email);
  await page.getByTestId("mobile-auth-password").fill(details.password);
  await page.getByTestId("mobile-auth-submit-signup").click();
  await waitForMobileMockAuthToSettle(page);
}

export async function signInOnMobileWeb(
  page: Page,
  details: { email: string; password: string },
) {
  await page.getByTestId("mobile-auth-email").fill(details.email);
  await page.getByTestId("mobile-auth-password").fill(details.password);
  await page.getByTestId("mobile-auth-submit-login").click();
  await waitForMobileMockAuthToSettle(page);
}

async function waitForMobileMockAuthToSettle(page: Page) {
  await page.waitForFunction(
    () =>
      Boolean(window.localStorage.getItem("horizon.mobile.mock.session")) ||
      window.location.pathname === "/login",
    undefined,
    { timeout: MOBILE_ASSERT_TIMEOUT_MS },
  );
}

export async function searchCityOnMobileWeb(page: Page, city: string) {
  const input = page.getByTestId("mobile-plan-city-input");
  await input.fill(city);
  // Click the + button instead of pressing Enter to avoid stale-closure issues
  // (onSubmitEditing captures cityQuery before the fill re-render)
  await page.getByTestId("mobile-plan-add-city").click();
}

export async function clickGenerateOnMobileWeb(page: Page) {
  await page.getByTestId("mobile-plan-generate").click();
}

export async function expectTripsOverviewPageMobile(page: Page) {
  await expect(page).toHaveURL(/\/trips/, {
    timeout: WEB_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByTestId("mobile-trips-overview-card")).toBeVisible({
    timeout: WEB_NAVIGATION_TIMEOUT_MS,
  });
}

export async function clickDetailFromTripsOverviewMobile(page: Page) {
  await page.getByTestId("mobile-trips-detail-link").first().click();
}

export async function searchCity(page: Page, city: string) {
  await page
    .getByRole("textbox", { name: "Origin", exact: true })
    .fill("Hà Nội");
  const input = page.getByTestId(WEB_PLAN_CITY_INPUT);
  await input.fill(city);
  await input.press("Enter");
}

export async function clickGenerate(page: Page) {
  await page.locator(WEB_PLAN_GENERATE_BUTTON).first().click();
}

export async function searchAndGenerate(page: Page, city: string) {
  await openPlanPage(page);
  await searchCity(page, city);
  await clickGenerate(page);
}

export async function expectGeneratingPage(page: Page, jobId: string) {
  const escapedJobId = escapeRegExp(jobId);
  await expect(page).toHaveURL(
    new RegExp(`/itinerary/generating/${escapedJobId}`),
  );
  await expect(page.getByTestId(WEB_GENERATING_SCREEN)).toBeVisible();
}

export async function expectItineraryPage(
  page: Page,
  itineraryId: string,
  expectedTitle: string,
) {
  const escapedItineraryId = escapeRegExp(itineraryId);
  await expect(page).toHaveURL(new RegExp(`/itinerary/${escapedItineraryId}`), {
    timeout: WEB_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByTestId(WEB_ITINERARY_TITLE)).toHaveText(expectedTitle);
}

export async function expectItineraryPageMobile(
  page: Page,
  itineraryId: string,
  expectedTitle: string,
) {
  const escapedItineraryId = escapeRegExp(itineraryId);
  await expect(page).toHaveURL(new RegExp(`/itinerary/${escapedItineraryId}`), {
    timeout: WEB_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByTestId("mobile-itinerary-title")).toHaveText(
    expectedTitle,
  );
}

export async function expectTripsOverviewPage(page: Page) {
  await expect(page).toHaveURL(/\/trips/, {
    timeout: WEB_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByTestId(WEB_TRIPS_OVERVIEW_CARD)).toBeVisible({
    timeout: WEB_NAVIGATION_TIMEOUT_MS,
  });
}

export async function clickDetailFromTripsOverview(page: Page) {
  await page.getByTestId(WEB_TRIPS_DETAIL_LINK).first().click();
}

export async function expectTripsWithCachedResult(
  page: Page,
  itineraryId: string,
) {
  const escapedItineraryId = escapeRegExp(itineraryId);
  await expect(page).toHaveURL(
    new RegExp(`/trips.*source=cached.*id=${escapedItineraryId}`),
    { timeout: WEB_NAVIGATION_TIMEOUT_MS },
  );
}

export async function verifyQueuedMobileRoute(
  page: Page,
  jobId: string,
  expectedTitle: string,
) {
  await page.goto(`/itinerary/${jobId}?source=queued`);
  await expect(page.getByTestId("mobile-itinerary-title")).toHaveText(
    expectedTitle,
    {
      timeout: MOBILE_ASSERT_TIMEOUT_MS,
    },
  );
}

export async function verifyMobileProfileFallback(page: Page) {
  await page.goto("/profile");
  await expect(page.getByTestId("mobile-profile-state")).toHaveText(
    /^(Not signed in|Auth unavailable)$/i,
    {
      timeout: MOBILE_ASSERT_TIMEOUT_MS,
    },
  );
}

export async function verifyMobileSavedFallback(page: Page) {
  await page.goto("/saved");
  await expect(page.getByTestId("mobile-saved-state")).toHaveText(
    /^(No saved trips yet|Saved trips unavailable)$/i,
    {
      timeout: MOBILE_ASSERT_TIMEOUT_MS,
    },
  );
}

export async function postSaveItinerary(
  request: APIRequestContext,
  itineraryId: string,
) {
  return request.post(`${API_BASE_URL}/api/itinerary/${itineraryId}/save`, {
    headers: apiAuthHeaders(),
  });
}

export async function patchShareItinerary(
  request: APIRequestContext,
  itineraryId: string,
) {
  return request.patch(`${API_BASE_URL}/api/itinerary/${itineraryId}/share`, {
    headers: apiJsonHeaders(),
    data: { is_public: true },
  });
}

export async function getSharedItinerary(
  request: APIRequestContext,
  shareToken: string,
) {
  return request.get(`${API_BASE_URL}/api/itinerary/shared/${shareToken}`);
}
