import { expect, test } from "@playwright/test";

function createIdentity() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    fullName: "Local E2E Traveler",
    email: `local.web.${id}@horizon.test`,
    password: "LocalPass-123!",
  };
}

test.describe("web first-party local authentication", () => {
  test("registers, signs out, and signs back in with the local API session", async ({ page }) => {
    const identity = createIdentity();

    await page.goto("/signup");
    await page.getByTestId("web-auth-full-name").fill(identity.fullName);
    await page.getByTestId("web-auth-email").fill(identity.email);
    await page.getByTestId("web-auth-password").fill(identity.password);
    await page.getByTestId("web-auth-submit-signup").click();

    await expect(page).toHaveURL(/\/plan$/);
    await expect.poll(() => page.evaluate(() => {
      const session = window.localStorage.getItem("horizon.local.auth.session");
      return session ? JSON.parse(session).user?.email : null;
    })).toBe(identity.email);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByTestId("web-auth-email").fill(identity.email);
    await page.getByTestId("web-auth-password").fill(identity.password);
    await page.getByTestId("web-auth-submit-login").click();
    await expect(page).toHaveURL(/\/plan$/);
  });

  test("shows local API errors for duplicate signup and invalid credentials", async ({ page }) => {
    const identity = createIdentity();

    await page.goto("/signup");
    await page.getByTestId("web-auth-full-name").fill(identity.fullName);
    await page.getByTestId("web-auth-email").fill(identity.email);
    await page.getByTestId("web-auth-password").fill(identity.password);
    await page.getByTestId("web-auth-submit-signup").click();
    await expect(page).toHaveURL(/\/plan$/);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByTestId("web-auth-email").fill(identity.email);
    await page.getByTestId("web-auth-password").fill("incorrect-password");
    await page.getByTestId("web-auth-submit-login").click();
    await expect(page.getByTestId("web-auth-error")).toBeVisible();

    await page.goto("/signup");
    await page.getByTestId("web-auth-full-name").fill(identity.fullName);
    await page.getByTestId("web-auth-email").fill(identity.email);
    await page.getByTestId("web-auth-password").fill(identity.password);
    await page.getByTestId("web-auth-submit-signup").click();
    await expect(page.getByTestId("web-auth-error")).toBeVisible();
  });

  test("explains that password recovery is unavailable for local accounts", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("web-auth-email").fill("traveler@horizon.test");
    await page.getByTestId("web-auth-password").focus();
    await expect(page.getByTestId("web-auth-account-checking")).not.toBeVisible();
    await page.getByTestId("web-auth-forgot-password").click();
    await expect(page.getByTestId("web-auth-error")).toContainText(
      "Local accounts cannot be reset until the server has an email delivery service",
    );
  });
});
