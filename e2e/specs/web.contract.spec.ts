import { test } from "@playwright/test";
import { cachedScenario, queuedScenario } from "../fixtures/index.mjs";
import {
  expectItineraryPage,
  expectTripsOverviewPage,
  clickDetailFromTripsOverview,
  searchAndGenerate,
  injectWebMockAuthSession,
} from "./helpers/e2e-helpers";

test.describe("web contract flows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await injectWebMockAuthSession(page);
  });

  test("queued generate flow reaches trips overview then detail page", async ({ page }) => {
    await searchAndGenerate(page, queuedScenario.city);

    await expectTripsOverviewPage(page);
    await clickDetailFromTripsOverview(page);
    await expectItineraryPage(
      page,
      queuedScenario.itineraryId,
      queuedScenario.itinerary.itineraries[0].title
    );
  });

  test("cached generate flow reaches trips overview then detail page", async ({ page }) => {
    await searchAndGenerate(page, cachedScenario.city);

    await expectTripsOverviewPage(page);
    await clickDetailFromTripsOverview(page);
    await expectItineraryPage(
      page,
      cachedScenario.itineraryId,
      cachedScenario.itinerary.itineraries[0].title
    );
  });
});
