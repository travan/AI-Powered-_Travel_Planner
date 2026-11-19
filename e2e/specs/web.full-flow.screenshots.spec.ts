import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "./helpers/test-fixtures";
import { cachedScenario } from "../fixtures/index.mjs";
import {
  API_BASE_URL,
  apiJsonHeaders,
  clickDetailFromTripsOverview,
  expectItineraryPage,
  expectTripsOverviewPage,
  searchAndGenerate,
  signUpOnWeb,
} from "./helpers/e2e-helpers";

const tripId = "11111111-1111-4111-8111-111111111111";
const hostToken = "Bearer e2e-user-1";

function captureDir() {
  const dir = path.join(process.cwd(), "ui-captures", "full-flow", "web-desktop");
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function capture(page: Page, fileName: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(captureDir(), fileName),
    // Workspace tabs can include long virtualized lists. Capturing the visible
    // surface keeps this visual regression flow bounded on CI runners.
    fullPage: false,
    animations: "disabled",
    timeout: 15_000,
  });
}

async function setMockSession(page: Page, userId: string, email: string, fullName: string) {
  await page.evaluate(
    ({ userId, email, fullName }) => {
      const session = {
        access_token: userId,
        refresh_token: `screenshot-refresh-${userId}`,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: userId,
          email,
          user_metadata: { full_name: fullName },
        },
      };
      window.localStorage.setItem(
        "horizon.mock.auth.session",
        JSON.stringify(session)
      );
      document.cookie = `horizon_mock_auth=${encodeURIComponent(JSON.stringify(session))}; Path=/; Max-Age=86400; SameSite=Lax`;
    },
    { userId, email, fullName }
  );
}

async function postJson<T>(request: APIRequestContext, pathName: string, data: unknown) {
  const response = await request.post(`${API_BASE_URL}${pathName}`, {
    headers: apiJsonHeaders(hostToken),
    data,
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function seedWorkspace(request: APIRequestContext) {
  await request.post(`${API_BASE_URL}/__e2e/reset-business-fixtures`);

  await postJson(request, `/api/trips/${tripId}/invites`, {
    email: "friend@example.com",
    role: "contributor",
    expiresInDays: 7,
  });

  await request.patch(`${API_BASE_URL}/api/trips/${tripId}/share-link`, {
    headers: apiJsonHeaders(hostToken),
    data: { enabled: true, role: "viewer" },
  });

  const activity = await postJson<{ id: string }>(request, `/api/trips/${tripId}/activities`, {
    activity_catalog_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    title: "Hoi An lantern workshop",
    category: "workshop",
    scheduled_at: "2026-08-10T09:30:00.000Z",
    location_name: "Hoi An Old Town",
    address: "Old Town, Hoi An",
    estimated_cost: 180000,
    currency: "VND",
  });

  await postJson(request, `/api/trips/${tripId}/transport-bookings`, {
    activity_id: activity.id,
    mode: "train",
    provider_name: "Vietnam Railways",
    booking_reference: "SE3-2026",
    origin_name: "Da Nang Station",
    destination_name: "Hue Station",
    departure_at: "2026-08-10T07:30:00.000Z",
    arrival_at: "2026-08-10T09:00:00.000Z",
    price: 110000,
    currency: "VND",
    booking_status: "ticketed",
    participant_user_ids: ["e2e-user-1", "e2e-user-2"],
  });

  const bill = await postJson<{ id: string }>(request, `/api/trips/${tripId}/bills`, {
    activity_id: activity.id,
    raw_text: "Hoi An Lantern Studio Lantern workshop bill total 600000 VND",
    total_amount: 600000,
    currency: "VND",
    merchant_name: "Hoi An Lantern Studio",
  });

  await postJson(request, `/api/bills/${bill.id}/analyze`, {});

  await postJson(request, `/api/trips/${tripId}/expenses`, {
    activity_id: activity.id,
    bill_upload_id: bill.id,
    title: "Hoi An Lantern Studio payment",
    amount: 600000,
    currency: "VND",
    paid_by_user_id: "e2e-user-1",
    split_strategy: "custom",
    splits: [
      { user_id: "e2e-user-1", amount: 300000 },
      { user_id: "e2e-user-2", amount: 300000 },
    ],
  });
}

test("captures the complete web full-flow surfaces", async ({ page, request }) => {
  test.setTimeout(180_000);
  await request.post(`${API_BASE_URL}/__e2e/reset-business-fixtures`);

  await page.goto("/login?redirectTo=/plan");
  await expect(page.getByTestId("web-auth-email")).toBeVisible();
  await capture(page, "01-login.png");

  await page.goto("/signup?redirectTo=/plan");
  await expect(page.getByTestId("web-auth-full-name")).toBeVisible();
  await capture(page, "02-signup.png");

  const identity = {
    fullName: "Screenshot Traveler",
    email: `screenshot.${Date.now()}@horizon.mock`,
    password: "secret123",
  };
  await signUpOnWeb(page, identity);
  await expect(page).toHaveURL(/\/plan$/);
  await capture(page, "03-plan.png");

  await searchAndGenerate(page, cachedScenario.city);
  await expectTripsOverviewPage(page);
  await capture(page, "04-trips-overview.png");

  await clickDetailFromTripsOverview(page);
  await expectItineraryPage(page, cachedScenario.itineraryId, cachedScenario.itinerary.itineraries[0].title);
  await capture(page, "05-itinerary-detail.png");

  await page.goto("/saved");
  await expect(page.getByTestId("web-saved-page-title")).toBeVisible();
  await capture(page, "06-saved.png");

  await seedWorkspace(request);

  await page.goto(`/trips/join?token=${tripId.slice(0, 8)}-invite-token&type=invite`);
  await expect(page.getByTestId("web-trip-join-page")).toBeVisible();
  await capture(page, "07-join-trip.png");

  await page.goto("/plan");
  await setMockSession(page, "e2e-user-1", "host@example.com", "Host Traveler");
  await page.goto(`/trips/${tripId}/workspace`);
  await expect(page.getByTestId("web-trip-workspace")).toBeVisible();

  for (const tab of ["overview", "members", "schedule", "transport", "bills", "review", "insights", "audit"] as const) {
    await page.getByTestId(`web-workspace-tab-${tab}`).click();
    await capture(page, `08-workspace-${tab}.png`);
  }
});
