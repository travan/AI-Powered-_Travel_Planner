import { expect, test } from "@playwright/test";
import { signInOnMobileWeb, signUpOnMobileWeb } from "./helpers/e2e-helpers";

function createAuthIdentity() {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    fullName: "Elias Horizon",
    email: `mobile.${token}@horizon.mock`,
    password: "secret123",
  };
}

test.describe("mobile web auth contract flows", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });
  });

  test("signup followed by profile and saved routes reflects an authenticated mobile session", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/signup");
    await signUpOnMobileWeb(page, identity);
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/profile");
    await expect(page.getByTestId("mobile-profile-name")).toBeVisible();

    await page.goto("/saved");
    await expect(page.getByText("Kyoto Cultural Escape")).toBeVisible();
  });

  test("login restores access to the signed-in mobile experience", async ({ page }) => {
    const identity = createAuthIdentity();

    await page.goto("/signup");
    await signUpOnMobileWeb(page, identity);
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/profile");
    await page.getByTestId("mobile-profile-signout").click();
    await expect(page.getByTestId("mobile-profile-state")).toHaveText("Not signed in");

    await page.goto("/login");
    await signInOnMobileWeb(page, identity);

    await page.goto("/profile");
    await expect(page.getByTestId("mobile-profile-name")).toBeVisible();
    await expect(page.getByTestId("mobile-profile-email")).toHaveText(identity.email);
  });
});