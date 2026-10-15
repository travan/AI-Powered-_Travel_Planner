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

  test("local password recovery uses the common API and accepts an emailed token", async ({ page }) => {
    await page.route("**/api/auth/forgot-password", async route => {
      expect(route.request().postDataJSON()).toEqual({ email: "traveler@horizon.test" });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto("/login");
    await page.getByTestId("web-auth-email").fill("traveler@horizon.test");
    await page.getByTestId("web-auth-password").focus();
    await expect(page.getByTestId("web-auth-account-checking")).not.toBeVisible();
    await page.getByTestId("web-auth-forgot-password").click();
    await expect(page.getByTestId("web-auth-success")).toBeVisible();
    await page.route("**/api/auth/reset-password", async route => {
      expect(route.request().postDataJSON()).toEqual({ token: "a".repeat(64), password: "New-password-93!" });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/reset-password#recovery_token=${"a".repeat(64)}`);
    await expect(page.getByTestId("reset-password-submit")).toBeEnabled();
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByTestId("reset-password-new-password").fill("New-password-93!");
    await page.getByTestId("reset-password-confirm-password").fill("New-password-93!");
    await page.getByTestId("reset-password-submit").click();
    await expect(page.getByTestId("reset-password-success")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/reset-password");
    await expect(page.getByTestId("reset-password-submit")).toBeDisabled();
  });
});
