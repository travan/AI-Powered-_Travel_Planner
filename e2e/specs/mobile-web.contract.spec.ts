import { expect, test } from "@playwright/test";
import { queuedScenario } from "../fixtures/index.mjs";

test.describe("mobile web contract flows", () => {
  test("queued itinerary route renders detail from the job endpoint", async ({
    page,
  }) => {
    await page.goto(`/itinerary/${queuedScenario.jobId}?source=queued`);

    await expect(page.getByTestId("mobile-itinerary-loading")).toBeVisible();
    await expect(page.getByTestId("mobile-itinerary-title")).toHaveText(
      queuedScenario.itinerary.itineraries[0].title
    );
  });

  test("profile and saved tabs degrade gracefully without Supabase env", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page.getByTestId("mobile-profile-state")).toHaveText(
      "Auth unavailable"
    );

    await page.goto("/saved");
    await expect(page.getByTestId("mobile-saved-state")).toHaveText(
      "Saved trips unavailable"
    );
  });
});
