import { expect, test } from "./helpers/test-fixtures";

function createIdentity() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    fullName: "Local Mobile Traveler",
    email: `local.mobile.${id}@horizon.test`,
    password: "LocalPass-123!",
  };
}

test("Expo Web local auth registers, loads profile, signs out, and logs back in", async ({
  page,
}) => {
  const identity = createIdentity();
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/signup");
  await page.getByTestId("mobile-auth-full-name").fill(identity.fullName);
  await page.getByTestId("mobile-auth-email").fill(identity.email);
  await page.getByTestId("mobile-auth-password").fill(identity.password);
  await page.getByTestId("mobile-auth-submit-signup").click();

  await expect(page).not.toHaveURL(/\/signup$/);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("horizon.mobile.local.session"),
    ),
  ).toBeNull();

  await page.goto("/profile");
  await expect(page.getByTestId("mobile-profile-name")).toHaveText(
    identity.fullName,
  );
  await expect(page.getByTestId("mobile-profile-email")).toHaveText(
    identity.email,
  );

  await page.getByTestId("mobile-profile-signout").click();
  await expect(page.getByTestId("mobile-profile-state")).toHaveText(
    "Not signed in",
  );

  await page.goto("/login");
  await page.getByTestId("mobile-auth-email").fill(identity.email);
  await page.getByTestId("mobile-auth-password").fill(identity.password);
  await page.getByTestId("mobile-auth-submit-login").click();

  await page.goto("/profile");
  await expect(page.getByTestId("mobile-profile-name")).toHaveText(
    identity.fullName,
  );
  await expect(page.getByTestId("mobile-profile-email")).toHaveText(
    identity.email,
  );
});

test("local mobile recovery calls the common API", async ({ page }) => {
  await page.route("**/api/auth/forgot-password", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: "traveler@horizon.test",
    });
    await route.fulfill({
      json: { ok: true },
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.goto("/login");
  await page.getByTestId("mobile-auth-email").fill("traveler@horizon.test");
  await page.getByTestId("mobile-auth-forgot-password").click();
  await expect(page.getByTestId("mobile-auth-reset-feedback-title")).toHaveText(
    "Reset sent",
  );
  await expect(
    page.getByTestId("mobile-auth-reset-feedback-message"),
  ).toContainText("If an account exists");
});
