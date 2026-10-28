import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { validatePlanning } from "../../packages/types/src/journey.ts";

// Isolated browser contexts and API fixtures: never reuse the user's session.
const baseURL = process.env.PLANNER_E2E_BASE_URL ?? "http://127.0.0.1:3107";
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    let submittedDraft;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/planning/config"))
        return route.fulfill({ json: { enabled: true, schema_version: 2 } });
      if (path.endsWith("/planning/validate"))
        return route.fulfill({
          json: validatePlanning(route.request().postDataJSON()),
        });
      if (path.endsWith("/search-drafts")) {
        submittedDraft = route.request().postDataJSON().search_payload;
        return route.fulfill({ json: { id: "e2e-draft" } });
      }
      if (path.includes("/cities")) return route.fulfill({ json: [] });
      return route.fulfill({ status: 200, json: {} });
    });
    await page.goto(`${baseURL}/plan`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByLabel("Origin", { exact: true }).fill("Hà Nội");
    assert.equal(
      await page.getByTestId("planner-optional-settings").getAttribute("open"),
      null,
    );
    await page.getByLabel("Destinations", { exact: true }).fill("Đà Nẵng");
    await page.getByLabel("Destinations", { exact: true }).press("Enter");
    await page
      .getByLabel("Total group budget (VND)", { exact: true })
      .fill("8000000");
    await page.getByRole("button", { name: "Mid-range", exact: true }).click();
    await page
      .getByRole("button", { name: "More adults", exact: true })
      .click();
    await page.getByText("Pick dates instead", { exact: true }).click();
    await page
      .getByRole("button", { name: "Choose Departure date", exact: true })
      .click();
    await page.getByLabel("Choose the Month").selectOption("0");
    await page.getByLabel("Choose the Year").selectOption("2027");
    await page
      .getByRole("button", { name: /Saturday, January 2nd, 2027/ })
      .click();
    assert.equal(
      await page.getByLabel("Return date", { exact: true }).inputValue(),
      "03/01/2027",
    );
    await page
      .getByRole("button", { name: "Choose Return date", exact: true })
      .click();
    assert.equal(
      await page
        .getByRole("button", { name: /Saturday, January 2nd, 2027/ })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("button", { name: /Wednesday, January 6th, 2027/ })
      .click();
    await page
      .getByRole("button", { name: "Choose Departure date", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Friday, January 8th, 2027/ })
      .click();
    assert.equal(
      await page.getByLabel("Return date", { exact: true }).inputValue(),
      "09/01/2027",
    );
    await page.getByRole("button", { name: "VI", exact: true }).click();
    assert.equal(
      await page.getByLabel("Điểm xuất phát", { exact: true }).inputValue(),
      "Hà Nội",
    );
    assert.equal(
      await page.getByLabel("Ngày đi", { exact: true }).inputValue(),
      "08/01/2027",
    );
    assert.equal(
      await page
        .getByLabel("Ngân sách tổng cả nhóm (VND)", { exact: true })
        .inputValue(),
      "8000000",
    );
    await page
      .getByRole("button", { name: "Chọn Ngày về", exact: true })
      .click();
    assert.equal(
      await page
        .locator('dialog[open] [data-day="2027-01-08"] button')
        .isDisabled(),
      true,
    );
    const dialog = await page.getByRole("dialog").boundingBox();
    assert.ok(
      dialog.x >= 0 && dialog.x + dialog.width <= viewport.width,
      `${name}: calendar overflow`,
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    await page.getByLabel("Tiền tệ", { exact: true }).selectOption("USD");
    assert.equal(
      await page
        .getByLabel("Ngân sách tổng cả nhóm (USD)", { exact: true })
        .inputValue(),
      "8000000",
    );
    await page
      .getByLabel("Ngân sách tổng cả nhóm (USD)", { exact: true })
      .fill("2000");
    await page
      .getByRole("button", {
        name: "Có yêu cầu ăn kiêng hoặc dị ứng? Thêm tại đây",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Dị ứng thực phẩm — bắt buộc", { exact: true })
      .fill("Đậu phộng");
    await page
      .locator('[data-testid="planner-optional-settings"] > summary')
      .click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
    );
    await page.getByRole("button", { name: "Lưu nháp", exact: true }).click();
    await page.reload();
    assert.equal(
      await page.getByLabel("Ngày về", { exact: true }).inputValue(),
      "09/01/2027",
    );
    assert.equal(
      await page
        .getByLabel("Ngân sách tổng cả nhóm (USD)", { exact: true })
        .inputValue(),
      "2000",
    );
    await page
      .getByRole("button", { name: "Tạo hành trình", exact: true })
      .click();
    await page.waitForURL(/\/login\?redirectTo=/);
    assert.ok(submittedDraft);
    assert.deepEqual(
      {
        start: submittedDraft.start_date,
        end: submittedDraft.end_date,
        budget: submittedDraft.budget,
        currency: submittedDraft.currency,
        style: submittedDraft.trip_style,
        travelers: submittedDraft.num_travelers,
        locale: submittedDraft.locale,
      },
      {
        start: "2027-01-08",
        end: "2027-01-09",
        budget: 2000,
        currency: "USD",
        style: "mid_range",
        travelers: 3,
        locale: "vi",
      },
    );
    assert.deepEqual(submittedDraft.planning.dining_preferences.allergies, [
      "Đậu phộng",
    ]);
    await page.screenshot({
      path: `/private/tmp/journey-${name}-e2e-login.png`,
    });
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${name}: calendar boundaries/auto-return, EN↔VI, budget/style/travelers, draft reload, submit → login preserving criteria; no overflow/errors (API fixtures)`,
    );
    await context.close();
  }
} finally {
  await browser.close();
}
