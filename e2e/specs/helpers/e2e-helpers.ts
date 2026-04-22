import { expect, Page, APIRequestContext } from "@playwright/test";

export const API_BASE_URL = "http://127.0.0.1:3101";
export const WEB_PLAN_CITY_INPUT = "web-plan-city-input";
export const WEB_PLAN_GENERATE_BUTTON = "[data-testid='web-plan-generate']:visible";
export const WEB_ITINERARY_TITLE = "web-itinerary-title";
export const WEB_GENERATING_SCREEN = "web-generating-screen";
export const WEB_AUTH_EMAIL = "web-auth-email";
export const WEB_AUTH_PASSWORD = "web-auth-password";
export const WEB_AUTH_FULL_NAME = "web-auth-full-name";
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
  await page.context().clearCookies();
  await page.evaluate(() => {
    window.localStorage.removeItem("horizon.mock.auth.session");
  });
}

export async function signUpOnWeb(page: Page, details: { fullName: string; email: string; password: string }) {
  await page.getByTestId(WEB_AUTH_FULL_NAME).fill(details.fullName);
  await page.getByTestId(WEB_AUTH_EMAIL).fill(details.email);
  await page.getByTestId(WEB_AUTH_PASSWORD).fill(details.password);
  await page.getByTestId("web-auth-submit-signup").click();
}

export async function signInOnWeb(page: Page, details: { email: string; password: string }) {
  await page.getByTestId(WEB_AUTH_EMAIL).fill(details.email);
  await page.getByTestId(WEB_AUTH_PASSWORD).fill(details.password);
  await page.getByTestId("web-auth-submit-login").click();
}

export async function signUpOnMobileWeb(page: Page, details: { fullName: string; email: string; password: string }) {
  await page.getByTestId("mobile-auth-full-name").fill(details.fullName);
  await page.getByTestId("mobile-auth-email").fill(details.email);
  await page.getByTestId("mobile-auth-password").fill(details.password);
  await page.getByTestId("mobile-auth-submit-signup").click();
}

export async function signInOnMobileWeb(page: Page, details: { email: string; password: string }) {
  await page.getByTestId("mobile-auth-email").fill(details.email);
  await page.getByTestId("mobile-auth-password").fill(details.password);
  await page.getByTestId("mobile-auth-submit-login").click();
}

export async function searchCity(page: Page, city: string) {
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
  await expect(page).toHaveURL(new RegExp(`/itinerary/generating/${escapedJobId}`));
  await expect(page.getByTestId(WEB_GENERATING_SCREEN)).toBeVisible();
}

export async function expectItineraryPage(page: Page, itineraryId: string, expectedTitle: string) {
  const escapedItineraryId = escapeRegExp(itineraryId);
  await expect(page).toHaveURL(new RegExp(`/itinerary/${escapedItineraryId}`), {
    timeout: WEB_NAVIGATION_TIMEOUT_MS,
  });
  await expect(page.getByTestId(WEB_ITINERARY_TITLE)).toHaveText(expectedTitle);
}

export async function verifyQueuedMobileRoute(page: Page, jobId: string, expectedTitle: string) {
  await page.goto(`/itinerary/${jobId}?source=queued`);
  await expect(page.getByTestId("mobile-itinerary-title")).toHaveText(expectedTitle, {
    timeout: MOBILE_ASSERT_TIMEOUT_MS,
  });
}

export async function verifyMobileProfileFallback(page: Page) {
  await page.goto("/profile");
  await expect(page.getByTestId("mobile-profile-state")).toHaveText(/^(Not signed in|Auth unavailable)$/i, {
    timeout: MOBILE_ASSERT_TIMEOUT_MS,
  });
}

export async function verifyMobileSavedFallback(page: Page) {
  await page.goto("/saved");
  await expect(page.getByTestId("mobile-saved-state")).toHaveText(/^(No saved trips yet|Saved trips unavailable)$/i, {
    timeout: MOBILE_ASSERT_TIMEOUT_MS,
  });
}

export async function postSaveItinerary(request: APIRequestContext, itineraryId: string) {
  return request.post(`${API_BASE_URL}/api/itinerary/${itineraryId}/save`, {
    headers: apiAuthHeaders(),
  });
}

export async function patchShareItinerary(request: APIRequestContext, itineraryId: string) {
  return request.patch(`${API_BASE_URL}/api/itinerary/${itineraryId}/share`, {
    headers: apiJsonHeaders(),
    data: { is_public: true },
  });
}

export async function getSharedItinerary(request: APIRequestContext, shareToken: string) {
  return request.get(`${API_BASE_URL}/api/itinerary/shared/${shareToken}`);
}
