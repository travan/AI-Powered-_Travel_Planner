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

test.describe("notifications", () => {
  async function fixture(page: import("@playwright/test").Page) {
    const calls = { unread: 0, list: 0, reads: 0 };
    const item = {
      id: "e2e-notification", subject_id: "e2e-draft", trip_id: null,
      category: "draft", event: "updated", attempt: null,
      created_at: "2026-01-02T08:00:00.000Z", read_at: null,
    };
    let failNextRead = false;
    await page.route("**/api/notifications**", async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const headers = { "access-control-allow-origin": "*" };
      if (pathname.endsWith("/unread")) {
        calls.unread++;
        await route.fulfill({ headers, json: { count: 1 } });
      } else if (pathname.endsWith("/read")) {
        calls.reads++;
        const fail = failNextRead;
        failNextRead = false;
        await route.fulfill({ headers, status: fail ? 503 : 200, json: { read: !fail } });
      } else {
        calls.list++;
        await route.fulfill({ headers, json: { items: [item], next: null } });
      }
    });
    await page.goto("/login");
    await injectWebMockAuthSession(page);
    await page.goto("/plan");
    const bell = page.getByRole("button", { name: /Notifications|Thông báo/ });
    await expect(bell).toContainText("1");
    return { calls, bell, failRead: () => { failNextRead = true; } };
  }

  test("dismisses on click outside and Escape, and reads once on hover then click", async ({ page }) => {
    const { calls, bell } = await fixture(page);
    expect(calls.unread, "initial unread request").toBe(1);
    await bell.click();
    const popup = page.getByRole("region", { name: /Notifications|Thông báo/ });
    const group = popup.locator("summary");
    await group.click();
    await expect(popup).toBeVisible();
    await page.locator("header").getByRole("link", { name: "CoHorizon" }).click();
    await expect(popup).toBeHidden();
    await bell.click();
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(bell).toBeFocused();

    await bell.click();
    const entry = popup.getByRole("link", { name: /Updated|Đã cập nhật/ });
    if (!(await entry.isVisible())) await group.click();
    await entry.hover();
    await expect(bell).not.toContainText("1");
    await expect.poll(() => calls.reads).toBe(1);
    expect(calls.unread, "unread requests after hover").toBe(1);
    await entry.click();
    expect(calls.unread, "unread requests after activating a read item").toBe(1);
    await page.getByTestId("desktop-navigation").getByRole("link", { name: "Guides" }).click();
    await expect(page).toHaveURL(/\/guides$/);
    expect(calls).toEqual({ unread: 1, list: 1, reads: 1 });
    await page.clock.install();
    await page.clock.fastForward(70_000);
    expect(calls.unread).toBe(1);
  });

  test("restores the unread badge on failure and supports keyboard retry", async ({ page }) => {
    const { bell, calls, failRead } = await fixture(page);
    failRead();
    await bell.click();
    const popup = page.getByRole("region", { name: /Notifications|Thông báo/ });
    await popup.locator("summary").click();
    const entry = popup.getByRole("link", { name: /Updated|Đã cập nhật/ });
    await entry.hover();
    await expect(popup.getByRole("alert")).toBeVisible();
    await expect(bell).toContainText("1");
    await entry.focus();
    await page.keyboard.press("Enter");
    await expect(bell).not.toContainText("1");
    await expect.poll(() => calls.reads).toBe(2);
    expect(calls.unread).toBe(1);
  });

  test.describe("touch and responsive layout", () => {
    test.use({ hasTouch: true });

    test("keeps both languages in bounds and reads on tap", async ({ page }) => {
      const { bell, calls } = await fixture(page);
      for (const language of ["EN", "VI"]) {
        await page.getByRole("button", { name: language, exact: true }).click();
        for (const width of [320, 390, 768, 1023, 1024, 1280]) {
          await page.setViewportSize({ width, height: 850 });
          const desktop = page.getByTestId("desktop-navigation");
          const mobile = page.getByTestId("mobile-navigation");
          if (width >= 1024) {
            await expect(desktop).toBeVisible();
            await expect(mobile).toBeHidden();
            const navBounds = await desktop.boundingBox();
            for (const link of await desktop.getByRole("link").all()) {
              const bounds = await link.boundingBox();
              expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(navBounds!.x + navBounds!.width);
              expect(bounds!.height).toBeLessThan(42);
            }
          } else {
            await expect(desktop).toBeHidden();
            await expect(mobile).toBeVisible();
          }
          const bellBounds = await bell.boundingBox();
          const accountBounds = await page.locator("header button[aria-expanded]").last().boundingBox();
          expect(bellBounds!.x >= accountBounds!.x + accountBounds!.width ||
            accountBounds!.x >= bellBounds!.x + bellBounds!.width).toBeTruthy();
          await bell.tap();
          const popup = page.getByRole("region", { name: /Notifications|Thông báo/ });
          const bounds = await popup.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
          await bell.tap();
        }
      }
      await page.setViewportSize({ width: 390, height: 850 });
      await bell.tap();
      const popup = page.getByRole("region", { name: /Notifications|Thông báo/ });
      await popup.locator("summary").tap();
      await popup.getByRole("link", { name: /Updated|Đã cập nhật/ }).tap();
      await expect(bell).not.toContainText("1");
      await expect.poll(() => calls.reads).toBe(1);
    });
  });
});
