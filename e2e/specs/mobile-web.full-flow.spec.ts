import { expect, test } from "./helpers/test-fixtures";
import { cachedScenario } from "../fixtures/index.mjs";
import {
  clearMobileWebMockAuthSession,
  clickDetailFromTripsOverviewMobile,
  clickGenerateOnMobileWeb,
  expectItineraryPageMobile,
  expectTripsOverviewPageMobile,
  searchCityOnMobileWeb,
  signInOnMobileWeb,
  signUpOnMobileWeb,
} from "./helpers/e2e-helpers";

test("guest completes the full available mobile journey and keeps the session", async ({
  page,
}) => {
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  const identity = {
    fullName: "Mobile Full Flow",
    email: `mobile-full-flow-${Date.now()}@horizon.mock`,
    password: "secret123",
  };

  await test.step("guest search is preserved through mobile signup", async () => {
    await page.goto("/plan");
    await clearMobileWebMockAuthSession(page);
    await page.reload();
    await expect(page.getByTestId("mobile-plan-screen")).toBeVisible();

    await searchCityOnMobileWeb(page, cachedScenario.city);
    await clickGenerateOnMobileWeb(page);
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });

    await page.getByTestId("mobile-auth-toggle-login").click();
    await expect(page).toHaveURL(/\/signup$/);
    await signUpOnMobileWeb(page, identity);

    await expectTripsOverviewPageMobile(page);
    await expect(page.getByTestId("mobile-trips-overview-card")).toContainText(
      cachedScenario.itinerary.itineraries[0].title,
    );
  });

  await test.step("generated mobile itinerary opens without a 404", async () => {
    await clickDetailFromTripsOverviewMobile(page);
    await expectItineraryPageMobile(
      page,
      cachedScenario.itineraryId,
      cachedScenario.itinerary.itineraries[0].title,
    );
    await expect(page.getByText("Morning in Cache City").first()).toBeVisible();
  });

  await test.step("profile and saved trips use the signed-in account", async () => {
    await page.goto("/profile");
    await expect(page.getByTestId("mobile-profile-name")).toHaveText(
      identity.fullName,
    );
    await expect(page.getByTestId("mobile-profile-email")).toHaveText(
      identity.email,
    );

    await page.goto("/saved");
    await expect(page.getByText("Kyoto Cultural Escape")).toBeVisible();
  });

  await test.step("sign out and sign back in restore the account", async () => {
    await page.goto("/profile");
    await page.getByTestId("mobile-profile-signout").click();
    await expect(page.getByTestId("mobile-profile-state")).toHaveText(
      "Not signed in",
    );

    await page.goto("/login");
    await signInOnMobileWeb(page, identity);
    await expect(page).not.toHaveURL(/\/login$/);

    await page.goto("/profile");
    await expect(page.getByTestId("mobile-profile-name")).toHaveText(
      identity.fullName,
    );
  });
});
