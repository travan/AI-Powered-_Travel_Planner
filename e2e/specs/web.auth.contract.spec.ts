import { expect, test } from "@playwright/test";
import { queuedScenario } from "../fixtures/index.mjs";
import {
  clearWebMockAuthSession,
  expectGeneratingPage,
  expectItineraryPage,
  searchAndGenerate,
  signInOnWeb,
  signUpOnWeb,
} from "./helpers/e2e-helpers";

function createAuthIdentity() {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    fullName: "Elias Horizon",
    email: `traveler.${token}@horizon.mock`,
    password: "secret123",
  };
}

test.describe("web auth contract flows", () => {
  test("protected saved route redirects to auth and signup preserves the redirect target", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/saved");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fsaved/);

    await page.getByTestId("web-auth-tab-signup").click();
    await expect(page).toHaveURL(/\/signup\?redirectTo=%2Fsaved/);

    await signUpOnWeb(page, identity);

    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.getByTestId("web-saved-page-title")).toHaveText("Your saved escapes");
    await expect(page.getByTestId("web-saved-page-state")).toContainText(identity.email);
  });

  test("login continues into the itinerary generation flow", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/signup");
    await signUpOnWeb(page, identity);
    await expect(page).toHaveURL(/\/plan$/);

    await clearWebMockAuthSession(page);

    await page.goto("/login?redirectTo=/plan");
    await signInOnWeb(page, identity);
    await expect(page).toHaveURL(/\/plan$/);

    await searchAndGenerate(page, queuedScenario.city);
    await expectGeneratingPage(page, queuedScenario.jobId);
    await expectItineraryPage(
      page,
      queuedScenario.itineraryId,
      queuedScenario.itinerary.itineraries[0].title
    );
  });
});