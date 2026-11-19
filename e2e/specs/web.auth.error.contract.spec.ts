import { expect, test } from "./helpers/test-fixtures";

const E2E_SIGNUP_ERROR_KEY = "horizon.e2e.signup.force_error";

function createAuthIdentity() {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    fullName: "Elias Horizon",
    email: `traveler.${token}@horizon.mock`,
    password: "secret123",
  };
}

/**
 * Inject a forced error scenario into the mock auth layer via localStorage.
 * The mock signUp handler reads and consumes this before processing real logic.
 */
async function injectSignUpError(page: import("@playwright/test").Page, scenario: { message: string; code: string }) {
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: E2E_SIGNUP_ERROR_KEY, value: scenario }
  );
}

test.describe("web auth error normalization contract", () => {
  test("signup with duplicate email shows normalized error message", async ({ page }) => {
    // Form assertions should not wait for third-party decorative images/fonts.
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await injectSignUpError(page, {
      message: "User already registered",
      code: "user_already_exists",
    });

    const identity = createAuthIdentity();
    await page.getByTestId("web-auth-full-name").fill(identity.fullName);
    await page.getByTestId("web-auth-email").fill(identity.email);
    await page.getByTestId("web-auth-password").fill(identity.password);
    await page.getByTestId("web-auth-submit-signup").click();

    await expect(page.getByTestId("web-auth-error")).toContainText("already registered");
    await expect(page.getByTestId("web-auth-error")).not.toContainText("User already registered");
  });

  test("signup with invalid email format shows normalized error message", async ({ page }) => {
    await page.goto("/signup", { waitUntil: "domcontentloaded" });
    await injectSignUpError(page, {
      message: "Email address is invalid",
      code: "invalid_email",
    });

    const identity = createAuthIdentity();
    await page.getByTestId("web-auth-full-name").fill(identity.fullName);
    await page.getByTestId("web-auth-email").fill(identity.email);
    await page.getByTestId("web-auth-password").fill(identity.password);
    await page.getByTestId("web-auth-submit-signup").click();

    await expect(page.getByTestId("web-auth-error")).toContainText("valid email");
  });
});
