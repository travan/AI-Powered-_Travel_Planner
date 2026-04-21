import { expect, Page, APIRequestContext } from "@playwright/test";

export const API_BASE_URL = "http://127.0.0.1:3101";
export const WEB_PLAN_CITY_INPUT = "web-plan-city-input";
export const WEB_PLAN_GENERATE_BUTTON = "[data-testid='web-plan-generate']:visible";
export const WEB_ITINERARY_TITLE = "web-itinerary-title";
export const WEB_GENERATING_SCREEN = "web-generating-screen";
const MOBILE_ASSERT_TIMEOUT_MS = 30_000;

function isSupabaseConfiguredForMobile() {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return Boolean(env?.EXPO_PUBLIC_SUPABASE_URL && env?.EXPO_PUBLIC_SUPABASE_ANON_KEY);
}

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
  await expect(page).toHaveURL(new RegExp(`/itinerary/${escapedItineraryId}`));
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
  const expectedState = isSupabaseConfiguredForMobile() ? "Not signed in" : "Auth unavailable";
  await expect(page.getByTestId("mobile-profile-state")).toHaveText(expectedState, {
    timeout: MOBILE_ASSERT_TIMEOUT_MS,
  });
}

export async function verifyMobileSavedFallback(page: Page) {
  await page.goto("/saved");
  const expectedState = isSupabaseConfiguredForMobile()
    ? "No saved trips yet"
    : "Saved trips unavailable";
  await expect(page.getByTestId("mobile-saved-state")).toHaveText(expectedState, {
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
