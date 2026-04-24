import { expect, test } from "@playwright/test";
import { injectWebMockAuthSession } from "./helpers/e2e-helpers";

test.describe("web desktop nav", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/plan");
    await injectWebMockAuthSession(page);
    // reload so the injected session is visible to the server
    await page.goto("/plan");
  });

  test("Home nav link navigates to /plan", async ({ page }) => {
    await page.goto("/trips?source=cached&id=cached-trip-1");
    const homeLink = page.locator("nav").getByRole("link", { name: "Home" }).first();
    await homeLink.click();
    await expect(page).toHaveURL(/\/plan/, { timeout: 10_000 });
  });

  test("Explore nav link navigates to /trips", async ({ page }) => {
    const exploreLink = page.locator("nav").getByRole("link", { name: "Explore" }).first();
    await exploreLink.click();
    await expect(page).toHaveURL(/\/trips/, { timeout: 10_000 });
  });

  test("Guides nav link navigates to /guides", async ({ page }) => {
    const guidesLink = page.locator("nav").getByRole("link", { name: "Guides" }).first();
    await guidesLink.click();
    await expect(page).toHaveURL(/\/guides/, { timeout: 10_000 });
    await expect(page.getByTestId("web-guides-page-title")).toBeVisible({ timeout: 10_000 });
  });

  test("active state is applied only to the current page nav link", async ({ page }) => {
    await page.goto("/guides");

    // Guides link should be active (text-primary class)
    const guidesLink = page.locator("nav").getByRole("link", { name: "Guides" }).first();
    await expect(guidesLink).toHaveClass(/text-primary/);

    // Explore link (/trips) should NOT be active
    const exploreLink = page.locator("nav").getByRole("link", { name: "Explore" }).first();
    await expect(exploreLink).not.toHaveClass(/text-primary/);
  });
});
