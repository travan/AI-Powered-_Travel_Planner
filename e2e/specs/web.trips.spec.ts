import { expect, test } from "@playwright/test";
import { queuedScenario, cachedScenario } from "../fixtures/index.mjs";
import {
  expectTripsOverviewPage,
  clickDetailFromTripsOverview,
  expectItineraryPage,
  searchCity,
  clickGenerate,
  openPlanPage,
  injectWebMockAuthSession,
} from "./helpers/e2e-helpers";

test.describe("web /trips results overview route", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await injectWebMockAuthSession(page);
  });

  test("queued generate redirects to /trips overview after job complete", async ({ page }) => {
    await openPlanPage(page);
    await searchCity(page, queuedScenario.city);
    await clickGenerate(page);

    // Should reach /trips overview after queued job completes
    await expectTripsOverviewPage(page);

    // Verify overview card displays itinerary title
    const card = page.getByTestId("web-trips-overview-card").first();
    await expect(card).toContainText(queuedScenario.itinerary.itineraries[0].title);
  });

  test("cached generate redirects directly to /trips", async ({ page }) => {
    await openPlanPage(page);
    await searchCity(page, cachedScenario.city);
    await clickGenerate(page);

    // Should redirect directly to /trips
    await expectTripsOverviewPage(page);
  });

  test("detail link from /trips overview navigates to itinerary page", async ({ page }) => {
    await openPlanPage(page);
    await searchCity(page, queuedScenario.city);
    await clickGenerate(page);

    await expectTripsOverviewPage(page);

    // Click detail link
    await clickDetailFromTripsOverview(page);
    await expectItineraryPage(
      page,
      queuedScenario.itineraryId,
      queuedScenario.itinerary.itineraries[0].title
    );
  });

  test("direct /trips URL with cached ID displays results", async ({ page }) => {
    // Navigate directly to /trips with cached result
    await page.goto(`/trips?source=cached&id=${cachedScenario.itineraryId}`);

    await expectTripsOverviewPage(page);
    await expect(page.getByTestId("web-trips-overview-card")).toBeVisible();
  });

  test("direct /trips URL with queued job ID polls results", async ({ page }) => {
    // Navigate directly to /trips with queued job
    await page.goto(`/trips?source=queued&id=${queuedScenario.jobId}`);

    await expectTripsOverviewPage(page);
  });
});
