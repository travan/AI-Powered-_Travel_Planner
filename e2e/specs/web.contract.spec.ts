import { test } from "@playwright/test";
import { cachedScenario, queuedScenario } from "../fixtures/index.mjs";
import {
  expectItineraryPage,
  expectGeneratingPage,
  searchAndGenerate,
} from "./helpers/e2e-helpers";

test.describe("web contract flows", () => {
  test("queued generate flow reaches the itinerary detail page", async ({ page }) => {
    await searchAndGenerate(page, queuedScenario.city);

    await expectGeneratingPage(page, queuedScenario.jobId);
    await expectItineraryPage(
      page,
      queuedScenario.itineraryId,
      queuedScenario.itinerary.itineraries[0].title
    );
  });

  test("cached generate flow skips the generating page", async ({ page }) => {
    await searchAndGenerate(page, cachedScenario.city);

    await expectItineraryPage(
      page,
      cachedScenario.itineraryId,
      cachedScenario.itinerary.itineraries[0].title
    );
  });
});
