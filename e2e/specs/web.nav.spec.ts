import { expect, test } from "@playwright/test";
import { injectWebMockAuthSession } from "./helpers/e2e-helpers";

test.describe("web desktop nav", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/plan");
    await injectWebMockAuthSession(page);
    // reload so the injected session is visible to the server
    await page.goto("/plan");
  });

  test("Plan nav link navigates to /plan", async ({ page }) => {
    await page.goto("/trips?source=cached&id=cached-trip-1");
    const planLink = page.locator("nav").getByRole("link", { name: "Plan" }).first();
    await planLink.click();
    await expect(page).toHaveURL(/\/plan/, { timeout: 10_000 });
  });

  test("My trips nav link navigates to /trips", async ({ page }) => {
    const myTripsLink = page.locator("nav").getByRole("link", { name: "My trips" }).first();
    await myTripsLink.click();
    await expect(page).toHaveURL(/\/trips/, { timeout: 10_000 });
  });

  test("Explore nav link navigates to /explore", async ({ page }) => {
    const exploreLink = page.locator("nav").getByRole("link", { name: "Explore" }).first();
    await exploreLink.click();
    await expect(page).toHaveURL(/\/explore/, { timeout: 10_000 });
    await expect(page.getByTestId("web-explore-page")).toBeVisible({ timeout: 10_000 });
  });

  test("Explore suggestion opens Plan with the destination preselected", async ({ page }) => {
    await page.goto("/explore");
    const customizeLink = page.getByTestId("web-explore-customize").first();
    const destinationHref = await customizeLink.getAttribute("href");

    await customizeLink.click();
    await expect(page).toHaveURL(/\/plan\?city=.+/, { timeout: 10_000 });
    await expect(page.getByTestId("web-plan-selected-city").first()).toBeVisible({ timeout: 10_000 });
    expect(destinationHref).toMatch(/\/plan\?city=.+/);
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

    // My trips and Explore links should NOT be active
    const myTripsLink = page.locator("nav").getByRole("link", { name: "My trips" }).first();
    await expect(myTripsLink).not.toHaveClass(/text-primary/);
    const exploreLink = page.locator("nav").getByRole("link", { name: "Explore" }).first();
    await expect(exploreLink).not.toHaveClass(/text-primary/);
  });
});
