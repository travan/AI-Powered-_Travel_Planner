import { expect, test } from "@playwright/test";
import { queuedScenario, cachedScenario } from "../fixtures/index.mjs";
import {
  searchCityOnMobileWeb,
  clickGenerateOnMobileWeb,
  expectTripsOverviewPageMobile,
  clickDetailFromTripsOverviewMobile,
  expectItineraryPageMobile,
  injectMobileMockAuthSession,
} from "./helpers/e2e-helpers";

test.describe("mobile web /trips results overview route", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
    // Inject a mock auth session so generate calls reach the API (not /login)
    await page.goto("/");
    await injectMobileMockAuthSession(page);
  });

  test("mobile queued generate redirects to /trips overview after job complete", async ({ page }) => {
    await page.goto("/plan");
    await searchCityOnMobileWeb(page, queuedScenario.city);
    await clickGenerateOnMobileWeb(page);

    // Should reach /trips overview after queued job completes
    await expectTripsOverviewPageMobile(page);

    // Verify card displays
    const card = page.getByTestId("mobile-trips-overview-card").first();
    await expect(card).toBeVisible();
  });

  test("mobile cached generate redirects directly to /trips", async ({ page }) => {
    await page.goto("/plan");
    await searchCityOnMobileWeb(page, cachedScenario.city);
    await clickGenerateOnMobileWeb(page);

    // Should redirect directly to /trips
    await expectTripsOverviewPageMobile(page);
  });

  test("mobile detail link from /trips overview navigates to itinerary page", async ({ page }) => {
    await page.goto("/plan");
    await searchCityOnMobileWeb(page, queuedScenario.city);
    await clickGenerateOnMobileWeb(page);

    await expectTripsOverviewPageMobile(page);

    // Click detail link and verify navigation
    await clickDetailFromTripsOverviewMobile(page);
    await expectItineraryPageMobile(page, queuedScenario.itineraryId, queuedScenario.itinerary.itineraries[0].title);
  });

  test("mobile direct /trips URL with cached ID displays results", async ({ page }) => {
    // Directly navigate to /trips with result
    await page.goto(`/trips?source=cached&id=${cachedScenario.itineraryId}`);

    await expectTripsOverviewPageMobile(page);
    await expect(page.getByTestId("mobile-trips-overview-card")).toBeVisible();
  });

  test("mobile direct /trips URL with queued job ID polls results", async ({ page }) => {
    // Directly navigate to /trips with queued job
    await page.goto(`/trips?source=queued&id=${queuedScenario.jobId}`);

    await expectTripsOverviewPageMobile(page);
  });
});
