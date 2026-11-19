import { expect, test } from "./helpers/test-fixtures";
import { injectWebMockAuthSession } from "./helpers/e2e-helpers";

test.describe("web trip collaboration workspace", () => {
  test("host can add activity, place signal, and activity-linked shared expense", async ({ page }) => {
    await page.goto("/");
    await injectWebMockAuthSession(page, "e2e-collab-host");

    await page.goto("/trips");
    await expect(page.getByTestId("web-trip-card").first()).toBeVisible();
    await page.getByTestId("web-trip-card").first().click();

    await expect(page.getByTestId("web-trip-detail-page")).toBeVisible();
    await expect(page.getByText("E2E Da Nang group trip")).toBeVisible();

    await page.getByTestId("activity-title-input").fill("Sunset basket boat test");
    await page.getByTestId("activity-place-input").fill("Cam Thanh Coconut Village");
    await page.getByTestId("add-activity-button").click();
    await expect(page.getByText("Sunset basket boat test").first()).toBeVisible();
    await expect(page.getByText(/Activity added/)).toBeVisible();

    await page.getByTestId("place-name-input").fill("Hidden Mango Cafe E2E");
    await page.getByTestId("place-address-input").fill("12 Bach Dang, Da Nang");
    await page.getByTestId("add-place-button").click();
    await expect(page.getByText("Hidden Mango Cafe E2E · pending")).toBeVisible();

    await page.getByTestId("expense-title-input").fill("Basket boat tickets E2E");
    await page.getByTestId("expense-amount-input").fill("600000");
    await page.getByTestId("expense-activity-select").selectOption({ label: "Sunset basket boat test" });
    await page.getByTestId("add-expense-button").click();

    const expenseCard = page.locator("div").filter({ hasText: "Basket boat tickets E2E" }).filter({ hasText: "300,000 VND" }).first();
    await expect(expenseCard).toContainText("Sunset basket boat test");
    await expect(expenseCard).toContainText("300,000 VND");
    await expect(page.getByText(/Expense added/)).toBeVisible();
    await expect(page.getByTestId("audit-log-card").filter({ hasText: "activity created" }).first()).toBeVisible();
    await expect(page.getByTestId("audit-log-card").filter({ hasText: "place submission created" }).first()).toBeVisible();
    await expect(page.getByTestId("audit-log-card").filter({ hasText: "expense created" }).first()).toBeVisible();
  });

  test("host can approve a pending contributor change request", async ({ page }) => {
    await page.goto("/");
    await injectWebMockAuthSession(page, "e2e-review-host");

    await page.goto("/trips");
    await page.getByTestId("web-trip-card").first().click();

    await expect(page.getByTestId("change-request-card").filter({ hasText: "Contributor seafood market" })).toBeVisible();
    await page.getByTestId("approve-change-request-button").first().click();

    await expect(page.getByText("Change request approved.")).toBeVisible();
    await expect(page.getByTestId("change-request-card").filter({ hasText: "activity · approved" })).toBeVisible();
    await expect(page.locator("div").filter({ hasText: "Contributor seafood market" }).filter({ hasText: "approved" }).first()).toBeVisible();
    await expect(page.getByTestId("audit-log-card").filter({ hasText: "change request approved" }).first()).toBeVisible();
  });

  test("host can review expense and place submissions with clear audit trail", async ({ page }) => {
    await page.goto("/");
    await injectWebMockAuthSession(page, "e2e-review-all-host");

    await page.goto("/trips");
    await page.getByTestId("web-trip-card").first().click();

    const expenseRequest = page.getByTestId("change-request-card").filter({ hasText: "Contributor market bill" });
    await expect(expenseRequest).toContainText("expense · pending");
    await expenseRequest.getByTestId("approve-change-request-button").click();
    await expect(page.getByTestId("change-request-card").filter({ hasText: "expense · approved" })).toBeVisible();

    const placeRequest = page.getByTestId("change-request-card").filter({ hasText: "Tiny Banh Mi Place" });
    await expect(placeRequest).toContainText("place_submission · pending");
    await placeRequest.getByTestId("reject-change-request-button").click();
    await expect(page.getByTestId("change-request-card").filter({ hasText: "place_submission · rejected" })).toBeVisible();
    await expect(page.getByText("Tiny Banh Mi Place · rejected")).toBeVisible();
    await expect(page.getByTestId("audit-log-card").filter({ hasText: "change request approved" }).first()).toBeVisible();
    await expect(page.getByTestId("audit-log-card").filter({ hasText: "change request rejected" }).first()).toBeVisible();
  });

  test("host can parse a bill into expense and data-quality signals", async ({ page }) => {
    await page.goto("/");
    await injectWebMockAuthSession(page, "e2e-bill-host");

    await page.goto("/trips");
    await page.getByTestId("web-trip-card").first().click();

    await expect(page.getByTestId("place-recommendation-card").first()).toContainText("Han River Coffee");
    await expect(page.getByTestId("transport-recommendation-card").first()).toContainText("SGN");

    await page.getByTestId("bill-place-input").fill("Hidden OCR Cafe");
    await page.getByTestId("bill-address-input").fill("18 Bach Dang, Da Nang");
    await page.getByTestId("bill-ocr-input").fill("Hidden OCR Cafe\nCoffee x2 90000\nCake 60000\nTotal 150000");
    await page.getByTestId("upload-bill-button").click();

    await expect(page.getByText(/Bill parsed with 2 items/)).toBeVisible();
    const billExpense = page.locator("div").filter({ hasText: "Bill at Hidden OCR Cafe" }).filter({ hasText: "150,000 VND" }).first();
    await expect(billExpense).toBeVisible();
    await expect(page.getByTestId("audit-log-card").filter({ hasText: "bill normalized" }).first()).toBeVisible();
  });
});
