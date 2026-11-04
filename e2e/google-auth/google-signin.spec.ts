import { test, expect, type Page } from "@playwright/test";
const origin = "http://127.0.0.1:3219";
function start(
  page: Page,
  intent: "signin" | "link" = "signin",
  password?: string,
) {
  return page.evaluate(
    async ({ intent, password }) => {
      const response = await fetch("/api/auth/google/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-auth-client": "web" },
        body: JSON.stringify({
          intent,
          password,
          next: "/account/security?google=linked",
        }),
      });
      return { status: response.status, data: await response.json() };
    },
    { intent, password },
  );
}
function callback(googleUrl: string, email: string, subject = email) {
  const url = new URL(googleUrl);
  const code = Buffer.from(
    JSON.stringify({
      sub: subject,
      email,
      nonce: url.searchParams.get("nonce"),
    }),
  ).toString("base64url");
  return `${origin}/api/auth/google/callback?state=${url.searchParams.get("state")}&code=${code}`;
}
async function register(page: Page, email: string) {
  const result = await page.evaluate(async (email) => {
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-client": "web" },
      body: JSON.stringify({ email, password: "Safe-test-password-93" }),
    });
    return r.json();
  }, email);
  return result.user.id;
}
async function restore(page: Page) {
  return page.evaluate(async () => {
    const r = await fetch("/api/auth/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-client": "web" },
      body: "{}",
    });
    return { status: r.status, data: await r.json() };
  });
}
test("Google button uses real API, persists HttpOnly session across proxy, and rejects replay", async ({
  page,
  context,
}) => {
  const email = `google-${Date.now()}@example.com`;
  let callbackUrl = "";
  await page.route("https://accounts.google.com/**", async (route) => {
    callbackUrl = callback(route.request().url(), email);
    await route.fulfill({
      contentType: "text/html",
      body: `<a id="continue" href="${callbackUrl.replace(/&/g, "&amp;")}">Continue</a>`,
    });
  });
  await page.goto("/login");
  await page.getByTestId("web-auth-google-login").click();
  await page.locator("#continue").click();
  await expect(page).toHaveURL(/\/plan/);
  const session = await restore(page);
  expect(session.status).toBe(200);
  expect(session.data.user.email).toBe(email);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "horizon_local_auth")).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    "horizon_local_refresh",
  );
  await page.goto(callbackUrl);
  await expect(page).toHaveURL(/error=google_invalid_state/);
});
test("same email requires password confirmation and explicit linking preserves user ID", async ({
  page,
}) => {
  await page.goto("/login");
  const email = `local-${Date.now()}@example.com`;
  const originalId = await register(page, email);
  let result = await start(page);
  await page.goto(callback(result.data.url, email));
  await expect(page).toHaveURL(/error=google_link_required/);
  result = await start(page, "link", "wrong");
  expect(result.status).toBe(400);
  // Exercise the actual account linking form, not just its endpoint.
  await page.goto("/account/security");
  await page
    .getByLabel(/Current password|Mật khẩu hiện tại/)
    .fill("Safe-test-password-93");
  await page.route("https://accounts.google.com/**", async (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<a id="continue" href="${callback(route.request().url(), email).replace(/&/g, "&amp;")}">Continue</a>`,
    }),
  );
  await page
    .getByRole("button", { name: /Confirm and continue|Xác nhận và tiếp tục/ })
    .click();
  await page.locator("#continue").click();
  await expect(page).toHaveURL(/google=linked/);
  expect((await restore(page)).data.user.id).toBe(originalId);
  await page.evaluate(() =>
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-client": "web" },
      body: "{}",
    }),
  );
  await page.goto("/login");
  result = await start(page);
  await page.goto(callback(result.data.url, email));
  expect((await restore(page)).data.user.id).toBe(originalId);
});
test("denied consent, invalid code, missing state and external redirect are safe", async ({
  page,
}) => {
  await page.goto("/login");
  let result = await start(page);
  let url = new URL(result.data.url);
  await page.goto(
    `/api/auth/google/callback?state=${url.searchParams.get("state")}&error=access_denied`,
  );
  await expect(page).toHaveURL(/error=google_cancelled/);
  result = await start(page);
  url = new URL(result.data.url);
  await page.goto(
    `/api/auth/google/callback?state=${url.searchParams.get("state")}&code=invalid`,
  );
  await expect(page).toHaveURL(/error=google_callback_error/);
  await page.goto("/api/auth/google/callback?code=invalid");
  await expect(page).toHaveURL(/error=google_invalid_state/);
  const external = await page.evaluate(async () => {
    const r = await fetch("/api/auth/google/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-auth-client": "web" },
      body: JSON.stringify({ intent: "signin", next: "//evil.example" }),
    });
    return r.json();
  });
  await page.goto(callback(external.url, `safe-${Date.now()}@example.com`));
  await expect(page).toHaveURL(/\/plan$/);
});
