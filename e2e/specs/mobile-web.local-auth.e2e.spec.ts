import { expect, test } from "@playwright/test";

function createIdentity() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    fullName: "Local Mobile Traveler",
    email: `local.mobile.${id}@horizon.test`,
    password: "LocalPass-123!",
  };
}

test("Expo Web local auth registers, loads profile, signs out, and logs back in", async ({ page }) => {
  const identity = createIdentity();
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/signup");
  await page.getByTestId("mobile-auth-full-name").fill(identity.fullName);
  await page.getByTestId("mobile-auth-email").fill(identity.email);
  await page.getByTestId("mobile-auth-password").fill(identity.password);
  await page.getByTestId("mobile-auth-submit-signup").click();

  await expect.poll(() => page.evaluate(() => {
    const session = window.sessionStorage.getItem("horizon.mobile.local.session");
    return session ? JSON.parse(session).user?.email : null;
  })).toBe(identity.email);

  await page.goto("/profile");
  await expect(page.getByTestId("mobile-profile-name")).toHaveText(identity.fullName);
  await expect(page.getByTestId("mobile-profile-email")).toHaveText(identity.email);

  await page.getByTestId("mobile-profile-signout").click();
  await expect(page.getByTestId("mobile-profile-state")).toHaveText("Not signed in");

  await page.goto("/login");
  await page.getByTestId("mobile-auth-email").fill(identity.email);
  await page.getByTestId("mobile-auth-password").fill(identity.password);
  await page.getByTestId("mobile-auth-submit-login").click();

  await page.goto("/profile");
  await expect(page.getByTestId("mobile-profile-name")).toHaveText(identity.fullName);
  await expect(page.getByTestId("mobile-profile-email")).toHaveText(identity.email);
});

test("explains password recovery is unavailable for local mobile accounts", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("mobile-auth-email").fill("traveler@horizon.test");
  await page.getByTestId("mobile-auth-forgot-password").click();

  await expect(page.getByTestId("mobile-auth-reset-feedback-title")).toHaveText("Reset unavailable");
  await expect(page.getByTestId("mobile-auth-reset-feedback-message")).toContainText(
    "Password recovery is not available for local accounts until an email delivery service is configured",
  );
});
