import { expect, test } from "@playwright/test";
import {
  cachedScenario,
  queuedScenario,
} from "../fixtures/index.mjs";

test.describe("web contract flows", () => {
  test("queued generate flow reaches the itinerary detail page", async ({
    page,
  }) => {
    await page.goto("/plan");

    await page.getByTestId("web-plan-city-input").fill(queuedScenario.city);
    await page.getByTestId("web-plan-city-input").press("Enter");
    await page.locator("[data-testid='web-plan-generate']:visible").first().click();

    await expect(page).toHaveURL(
      new RegExp(`/itinerary/generating/${queuedScenario.jobId}`)
    );
    await expect(page.getByTestId("web-generating-screen")).toBeVisible();

    await expect(page).toHaveURL(
      new RegExp(`/itinerary/${queuedScenario.itineraryId}`)
    );
    await expect(page.getByTestId("web-itinerary-title")).toHaveText(
      queuedScenario.itinerary.itineraries[0].title
    );
  });

  test("cached generate flow skips the generating page", async ({ page }) => {
    await page.goto("/plan");

    await page.getByTestId("web-plan-city-input").fill(cachedScenario.city);
    await page.getByTestId("web-plan-city-input").press("Enter");
    await page.locator("[data-testid='web-plan-generate']:visible").first().click();

    await expect(page).toHaveURL(
      new RegExp(`/itinerary/${cachedScenario.itineraryId}`)
    );
    await expect(page.getByTestId("web-itinerary-title")).toHaveText(
      cachedScenario.itinerary.itineraries[0].title
    );
  });
});
