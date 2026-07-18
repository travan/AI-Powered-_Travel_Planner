import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { cachedScenario } from "../fixtures/index.mjs";
import {
  clickDetailFromTripsOverviewMobile,
  clickGenerateOnMobileWeb,
  expectItineraryPageMobile,
  expectTripsOverviewPageMobile,
  injectMobileMockAuthSession,
  searchCityOnMobileWeb,
  signInOnMobileWeb,
  signUpOnMobileWeb,
} from "./helpers/e2e-helpers";

function captureDir() {
  const dir = path.join(process.cwd(), "ui-captures", "full-flow", "mobile-web");
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function capture(page: Page, fileName: string) {
  await page.screenshot({
    path: path.join(captureDir(), fileName),
    fullPage: true,
    animations: "disabled",
  });
}

test("captures the complete mobile web full-flow surfaces", async ({ page }) => {
  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  await page.goto("/login");
  await expect(page.getByTestId("mobile-auth-email")).toBeVisible();
  await capture(page, "01-login.png");

  await page.goto("/signup");
  await expect(page.getByTestId("mobile-auth-full-name")).toBeVisible();
  await capture(page, "02-signup.png");

  const identity = {
    fullName: "Mobile Screenshot Traveler",
    email: `mobile.screenshot.${Date.now()}@horizon.mock`,
    password: "secret123",
  };
  await signUpOnMobileWeb(page, identity);
  if (/\/login$/.test(page.url())) {
    await signInOnMobileWeb(page, identity);
  }

  await page.goto("/plan");
  await injectMobileMockAuthSession(page, "screenshot-traveler");
  await expect(page.getByTestId("mobile-plan-screen")).toBeVisible();
  await capture(page, "03-plan.png");

  await searchCityOnMobileWeb(page, cachedScenario.city);
  await clickGenerateOnMobileWeb(page);
  await expectTripsOverviewPageMobile(page);
  await capture(page, "04-trips-overview.png");

  await clickDetailFromTripsOverviewMobile(page);
  await expectItineraryPageMobile(page, cachedScenario.itineraryId, cachedScenario.itinerary.itineraries[0].title);
  await capture(page, "05-itinerary-detail.png");

  await page.goto("/profile");
  await expect(page.getByTestId("mobile-profile-name")).toBeVisible();
  await capture(page, "06-profile.png");

  await page.goto("/saved");
  await expect(page.getByTestId("mobile-saved-state").or(page.getByText("Kyoto Cultural Escape"))).toBeVisible();
  await capture(page, "07-saved.png");
});
