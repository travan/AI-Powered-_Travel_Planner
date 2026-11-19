import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "./helpers/test-fixtures";
import { API_BASE_URL } from "./helpers/e2e-helpers";

const tripId = "11111111-1111-4111-8111-111111111111";

async function setMockSession(
  page: Page,
  userId: string,
  email: string,
  fullName: string,
) {
  await page.evaluate(
    ({ userId, email, fullName }) => {
      const session = {
        access_token: userId,
        refresh_token: `e2e-refresh-${userId}`,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: userId,
          email,
          user_metadata: { full_name: fullName },
        },
      };
      window.localStorage.setItem(
        "horizon.mock.auth.session",
        JSON.stringify(session),
      );
      document.cookie = `horizon_mock_auth=${encodeURIComponent(JSON.stringify(session))}; Path=/; Max-Age=86400; SameSite=Lax`;
    },
    { userId, email, fullName },
  );
}

test.beforeEach(async ({ page, request }) => {
  await request.post(`${API_BASE_URL}/__e2e/reset-business-fixtures`);
  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await setMockSession(page, "e2e-user-1", "host@example.com", "Host Traveler");
});

test("host can manage members, invite, share, friend join, contributor block, and audit", async ({
  page,
  request,
}) => {
  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("web-trip-workspace")).toBeVisible();
  await page.getByTestId("web-workspace-tab-members").click();
  await expect(page.getByTestId("web-members-list")).toContainText(
    "Viewer Traveler",
  );

  await page.getByTestId("web-invite-email").fill("new-friend@example.com");
  await page.getByTestId("web-invite-role").selectOption("contributor");
  await page.getByTestId("web-create-invite").click();
  await expect(page.getByTestId("web-invite-token")).toContainText(
    "11111111-invite-token",
  );
  await expect(page.getByTestId("web-invite-link")).toContainText(
    "/trips/join?token=11111111-invite-token&type=invite",
  );
  await page.getByTestId("web-copy-invite-link").click();
  await expect(page.getByTestId("web-copy-invite-link")).toContainText(
    "Copied invite link",
  );

  await page.getByTestId("web-share-role").selectOption("viewer");
  await page.getByTestId("web-enable-share").click();
  await expect(page.getByTestId("web-share-token")).toContainText(
    "11111111-share-token",
  );
  await expect(page.getByTestId("web-share-link")).toContainText(
    "/trips/join?token=11111111-share-token",
  );
  await page.getByTestId("web-copy-share-link").click();
  await expect(page.getByTestId("web-copy-share-link")).toContainText(
    "Copied share link",
  );

  await page.getByTestId("web-member-role-e2e-user-2").selectOption("contributor");
  await page.getByTestId("web-member-save-e2e-user-2").click();
  await expect(page.getByTestId("web-member-role-e2e-user-2")).toHaveValue(
    "contributor",
  );

  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await setMockSession(
    page,
    "e2e-user-3",
    "friend@example.com",
    "Friend Traveler",
  );
  await page.goto("/trips/join?token=11111111-invite-token&type=invite", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("web-trip-join-page")).toBeVisible();
  await page.getByTestId("web-trip-join-submit").click();
  await expect(page.getByTestId("web-trip-join-message")).toContainText(
    "Joined trip as contributor",
  );
  await page.getByTestId("web-trip-join-open-workspace").click();
  await page.getByTestId("web-workspace-tab-members").click();
  await expect(page.getByTestId("web-members-list")).toContainText(
    "Friend Traveler",
  );

  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await setMockSession(
    page,
    "e2e-user-2",
    "viewer@example.com",
    "Viewer Traveler",
  );
  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("web-workspace-tab-members").click();
  await expect(page.getByTestId("web-member-role-e2e-user-3")).toBeDisabled();
  await expect(page.getByTestId("web-member-save-e2e-user-3")).toBeDisabled();
  const forbiddenUpdate = await request.patch(
    `${API_BASE_URL}/api/trips/${tripId}/members/e2e-user-3`,
    {
      headers: { Authorization: "Bearer e2e-user-2" },
      data: { role: "co_host" },
    },
  );
  expect(forbiddenUpdate.status()).toBe(403);
  await expect(page.getByTestId("web-workspace-tab-audit")).toHaveCount(0);

  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await setMockSession(page, "e2e-user-1", "host@example.com", "Host Traveler");
  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });

  await page.getByTestId("web-workspace-tab-audit").click();
  await page.getByTestId("web-audit-filter").selectOption("trip");
  await expect(page.getByTestId("web-audit-list")).toContainText(
    "share_link_enabled",
  );
  await page.getByTestId("web-audit-filter").selectOption("trip_invite");
  await expect(page.getByTestId("web-audit-list")).toContainText("accepted");
  await page.getByTestId("web-audit-filter").selectOption("all");
  await expect(page.getByTestId("web-audit-list")).toContainText("updated");
  await expect(page.getByTestId("web-audit-list")).toContainText(
    "share_link_enabled",
  );
  await expect(page.getByTestId("web-audit-list")).toContainText("accepted");
});

test("host can plan activities from catalog and track participation", async ({
  page,
}) => {
  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });

  await page.getByTestId("web-workspace-tab-schedule").click();
  await expect(page.getByTestId("web-activity-planner")).toBeVisible();
  await expect(page.getByTestId("web-activity-catalog-list")).toContainText(
    "Hoi An lantern workshop",
  );

  await page
    .getByTestId(
      "web-add-catalog-activity-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    )
    .click();
  await expect(page.getByTestId("web-trip-activities-list")).toContainText(
    "Hoi An lantern workshop",
  );

  await page
    .locator("[data-testid^='web-activity-edit-time-']")
    .first()
    .fill("2026-08-10T09:30");
  await page
    .locator("[data-testid^='web-activity-edit-location-']")
    .first()
    .fill("Updated Hoi An Old Town");
  await page
    .locator("[data-testid^='web-activity-edit-cost-']")
    .first()
    .fill("180000");
  await page
    .locator("[data-testid^='web-activity-save-details-']")
    .first()
    .click();
  await expect(page.getByTestId("web-trip-activities-list")).toContainText(
    "Updated Hoi An Old Town",
  );
  await expect(page.getByTestId("web-trip-activities-list")).toContainText(
    "Aug 10, 2026",
  );

  const activityStatus = page
    .locator("[data-testid^='web-activity-status-']")
    .first();
  await activityStatus.selectOption("scheduled");
  await expect(activityStatus).toHaveValue("scheduled");

  const activityCheck = page
    .locator("input[data-testid^='web-activity-check-']")
    .first();
  // Changing the status persists the activity and refreshes the workspace
  // audit/review data before the progress checkbox becomes interactive again.
  await expect(activityCheck).toBeEnabled();
  await expect(activityCheck).not.toBeChecked();
  await activityCheck.click();
  await expect(activityCheck).toBeChecked();
  await expect(page.getByTestId("web-schedule-progress-count")).toHaveText(
    "1/1",
  );

  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await setMockSession(
    page,
    "e2e-user-2",
    "guest@example.com",
    "Guest Traveler",
  );
  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("web-workspace-tab-schedule").click();
  await expect(
    page.locator("[data-testid^='web-activity-status-']").first(),
  ).toBeDisabled();
  await expect(
    page.locator("[data-testid^='web-activity-edit-title-']").first(),
  ).toBeDisabled();
  await expect(
    page.locator("[data-testid^='web-activity-save-details-']").first(),
  ).toBeDisabled();
  await page
    .locator("[data-testid^='web-activity-rsvp-'][data-testid$='-joined']")
    .first()
    .click();
  await expect(
    page.locator("[data-testid^='web-activity-participation-']").first(),
  ).toContainText("joined");

  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await setMockSession(page, "e2e-user-1", "host@example.com", "Host Traveler");
  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("web-workspace-tab-schedule").click();
  await page.getByTestId("web-custom-activity-title").fill("Sunset photo walk");
  await page.getByTestId("web-custom-activity-category").fill("photo");
  await page.getByTestId("web-custom-activity-location").fill("An Bang Beach");
  await page.getByTestId("web-custom-activity-cost").fill("250000");
  await page.getByTestId("web-create-custom-activity").click();
  await expect(page.getByTestId("web-trip-activities-list")).toContainText(
    "Sunset photo walk",
  );

  await page.getByTestId("web-workspace-tab-audit").click();
  await expect(page.getByTestId("web-audit-list")).toContainText(
    "participant_joined",
  );
  await expect(page.getByTestId("web-audit-list")).toContainText(
    "trip_activity",
  );
});

test("host can track transport booking across multiple travel modes", async ({
  page,
  request,
}) => {
  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });

  await page.getByTestId("web-workspace-tab-schedule").click();
  await page
    .getByTestId(
      "web-add-catalog-activity-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    )
    .click();
  await expect(page.getByTestId("web-trip-activities-list")).toContainText(
    "Hoi An lantern workshop",
  );

  await page.getByTestId("web-workspace-tab-transport").click();
  await expect(page.getByTestId("web-transport-panel")).toBeVisible();

  await page
    .getByTestId("web-transport-activity")
    .selectOption({ label: "Hoi An lantern workshop" });
  await page.getByTestId("web-transport-mode").selectOption("train");
  await page.getByTestId("web-transport-status").selectOption("reserved");
  await page.getByTestId("web-transport-provider").fill("Vietnam Railways");
  await page.getByTestId("web-transport-reference").fill("SE3-2026");
  await page.getByTestId("web-transport-origin").fill("Da Nang Station");
  await page.getByTestId("web-transport-destination").fill("Hue Station");
  await page.getByTestId("web-transport-price").fill("320000");
  await page
    .getByTestId("web-transport-notes")
    .fill("Soft seat, morning departure");
  await page
    .getByTestId("web-transport-participant-e2e-user-1")
    .check({ force: true });
  await page
    .getByTestId("web-transport-participant-e2e-user-2")
    .check({ force: true });
  await page.getByTestId("web-create-transport").click();

  await expect(page.getByTestId("web-transport-list")).toContainText("Train");
  await expect(page.getByTestId("web-transport-list")).toContainText(
    "Linked activity: Hoi An lantern workshop",
  );
  await expect(page.getByTestId("web-transport-list")).toContainText(
    "Da Nang Station to Hue Station",
  );
  await expect(
    page.locator("[data-testid^='web-transport-participants-']").first(),
  ).toContainText("2");

  const bookingStatus = page
    .locator("[data-testid^='web-transport-booking-status-']")
    .first();
  await bookingStatus.selectOption("ticketed");
  await expect(bookingStatus).toHaveValue("ticketed");

  await page
    .locator("[data-testid^='web-transport-price-draft-']")
    .first()
    .fill("110000");
  await page
    .locator("[data-testid^='web-transport-save-price-']")
    .first()
    .click();
  await expect(
    page.locator("[data-testid^='web-transport-price-draft-']").first(),
  ).toHaveValue("110000");

  const invalidParticipant = await request.post(
    `${API_BASE_URL}/api/trips/${tripId}/transport-bookings`,
    {
      headers: { Authorization: "Bearer e2e-user-1" },
      data: {
        mode: "train",
        origin_name: "Da Nang Station",
        destination_name: "Hoi An",
        participant_user_ids: ["not-active-user"],
      },
    },
  );
  expect(invalidParticipant.status()).toBe(400);

  await page.getByTestId("web-workspace-tab-audit").click();
  await expect(page.getByTestId("web-audit-list")).toContainText(
    "transport_booking",
  );
  await expect(page.getByTestId("web-audit-list")).toContainText("updated");
});

test("host can capture bills, create custom expense splits, and settle balances", async ({
  page,
  request,
}) => {
  test.slow();
  const promoteExpenseParticipant = await request.patch(
    `${API_BASE_URL}/api/trips/${tripId}/members/e2e-user-2`,
    {
      headers: { Authorization: "Bearer e2e-user-1" },
      data: { role: "contributor" },
    },
  );
  expect(promoteExpenseParticipant.ok()).toBeTruthy();

  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });

  await page.getByTestId("web-workspace-tab-schedule").click();
  await page
    .getByTestId(
      "web-add-catalog-activity-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    )
    .click();
  await expect(page.getByTestId("web-trip-activities-list")).toContainText(
    "Hoi An lantern workshop",
  );

  await page.getByTestId("web-workspace-tab-bills").click();
  await expect(page.getByTestId("web-bills-panel")).toBeVisible();

  await page
    .getByTestId("web-bill-activity")
    .selectOption({ label: "Hoi An lantern workshop" });
  await page.getByTestId("web-bill-merchant").fill("Hoi An Lantern Studio");
  await page.getByTestId("web-bill-total").fill("600000");
  await page
    .getByTestId("web-bill-raw-text")
    .fill("Lantern workshop bill total 600000 VND");
  await page.getByTestId("web-create-bill").click();
  await expect(page.getByTestId("web-bill-list")).toContainText(
    "Hoi An Lantern Studio",
  );

  await page
    .locator("[data-testid^='web-bill-edit-merchant-']")
    .first()
    .fill("Hoi An Lantern Studio Updated");
  await page
    .locator("[data-testid^='web-bill-edit-total-']")
    .first()
    .fill("600000");
  await page
    .locator("[data-testid^='web-bill-edit-raw-']")
    .first()
    .fill("Updated lantern workshop bill total 600000 VND");
  await page.locator("[data-testid^='web-bill-save-details-']").first().click();
  await expect(page.getByTestId("web-bill-list")).toContainText(
    "Hoi An Lantern Studio Updated",
  );

  await page.locator("[data-testid^='web-bill-analyze-']").first().click();
  await page.getByTestId("web-workspace-tab-insights").click();
  await expect(page.getByTestId("web-insights-panel")).toBeVisible();
  await expect(page.getByTestId("web-ocr-merchant")).toContainText(
    "Hoi An Lantern Studio Updated",
  );
  await expect(page.getByTestId("web-ocr-line-items")).toContainText(
    "Lantern workshop",
  );
  await expect(page.getByTestId("web-data-quality-signals")).toContainText(
    "price evidence",
  );
  await expect(page.getByTestId("web-place-recommendations")).toContainText(
    "Hoi An lantern workshop",
  );
  await expect(page.getByTestId("web-transport-price-insights")).toContainText(
    "Vietnam Railways",
  );

  await page.getByTestId("web-workspace-tab-bills").click();
  await expect(page.getByTestId("web-expense-title")).toHaveValue(
    "Hoi An Lantern Studio Updated payment",
  );
  await expect(page.getByTestId("web-expense-participant-count")).toContainText(
    "2 of 2 selected",
  );
  await page
    .getByTestId("web-expense-participant-e2e-user-2")
    .uncheck({ force: true });
  await expect(page.getByTestId("web-expense-participant-count")).toContainText(
    "1 of 2 selected",
  );
  await page
    .getByTestId("web-expense-participant-e2e-user-2")
    .check({ force: true });
  await page.getByTestId("web-expense-split-strategy").selectOption("custom");
  await page.getByTestId("web-custom-split-e2e-user-1").fill("100000");
  await page.getByTestId("web-custom-split-e2e-user-2").fill("100000");
  await expect(page.getByTestId("web-custom-split-summary")).toContainText(
    "remaining",
  );
  // Inputs must not expand the mobile layout viewport and shift click targets.
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
  const createExpenseButton = page.getByTestId("web-create-expense");
  await createExpenseButton.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await createExpenseButton.click();
  await expect(page.getByTestId("web-workspace-message")).toContainText(
    "Custom split total must equal expense amount",
  );

  await page.getByTestId("web-custom-split-e2e-user-1").fill("300000");
  await page.getByTestId("web-custom-split-e2e-user-2").fill("300000");
  await createExpenseButton.evaluate((element) =>
    element.scrollIntoView({ block: "center" }),
  );
  await createExpenseButton.click();
  await expect(page.getByTestId("web-expense-list")).toContainText(
    "Hoi An Lantern Studio Updated payment",
  );
  await expect(
    page.locator("[data-testid^='web-expense-activity-']").first(),
  ).toContainText("Hoi An lantern workshop");

  await page.getByTestId("web-workspace-tab-review").click();
  await expect(page.getByTestId("web-review-panel")).toBeVisible();
  await expect(page.getByTestId("web-review-list")).toContainText(
    "Hoi An Lantern Studio Updated payment",
  );
  await page
    .locator("[data-testid^='web-review-approve-expense-']")
    .first()
    .click();

  await page.getByTestId("web-workspace-tab-bills").click();
  const expenseStatus = page
    .locator("[data-testid^='web-expense-status-']")
    .first();
  await expect(expenseStatus).toHaveValue("approved");

  const expenseList = await request.get(
    `${API_BASE_URL}/api/trips/${tripId}/expenses`,
    {
      headers: { Authorization: "Bearer e2e-user-1" },
    },
  );
  const [createdExpense] = (await expenseList.json()) as Array<{
    id: string;
    splits: Array<{ id: string; userId: string }>;
  }>;
  const hostSplit = createdExpense.splits.find(
    (split) => split.userId === "e2e-user-1",
  );
  expect(hostSplit).toBeTruthy();
  const forbiddenSettle = await request.patch(
    `${API_BASE_URL}/api/trips/${tripId}/expenses/${createdExpense.id}/splits/${hostSplit!.id}`,
    {
      headers: { Authorization: "Bearer e2e-user-2" },
      data: { status: "settled" },
    },
  );
  expect(forbiddenSettle.status()).toBe(403);

  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await setMockSession(
    page,
    "e2e-user-2",
    "viewer@example.com",
    "Viewer Traveler",
  );
  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("web-workspace-tab-bills").click();
  await expect(
    page.locator("[data-testid^='web-expense-split-status-']").first(),
  ).toBeDisabled();
  const guestSplit = page
    .locator("[data-testid^='web-expense-split-status-']")
    .nth(1);
  await expect(guestSplit).toBeEnabled();
  await guestSplit.selectOption("settled");
  await expect(guestSplit).toHaveValue("settled");

  await page.goto("/plan", { waitUntil: "domcontentloaded" });
  await setMockSession(page, "e2e-user-1", "host@example.com", "Host Traveler");
  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("web-workspace-tab-audit").click();
  await page.getByTestId("web-audit-filter").selectOption("bill_upload");
  await expect(page.getByTestId("web-audit-list")).toContainText("bill_upload");
  await expect(page.getByTestId("web-audit-list")).toContainText(
    "ocr_normalized",
  );
  await page.getByTestId("web-audit-filter").selectOption("expense");
  await expect(page.getByTestId("web-audit-list")).toContainText("expense");
  await expect(page.getByTestId("web-audit-list")).toContainText(
    "host_approved",
  );
  await page.getByTestId("web-audit-filter").selectOption("expense_split");
  await expect(page.getByTestId("web-audit-list")).toContainText(
    "expense_split",
  );
  await expect(page.getByTestId("web-audit-list")).toContainText(
    "status_settled",
  );
});

test("workspace captures key responsive surfaces", async ({
  page,
}, testInfo) => {
  await page.goto(`/trips/${tripId}/workspace`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("web-trip-workspace")).toBeVisible();

  const captureDir = path.join(process.cwd(), "ui-captures", "workspace");
  mkdirSync(captureDir, { recursive: true });
  const projectName = testInfo.project.name
    .replace(/[^a-z0-9-]/gi, "-")
    .toLowerCase();
  const tabs = [
    "overview",
    "members",
    "schedule",
    "transport",
    "bills",
    "audit",
  ] as const;

  for (const tab of tabs) {
    await page.getByTestId(`web-workspace-tab-${tab}`).click();
    await page.screenshot({
      path: path.join(captureDir, `${projectName}-${tab}.png`),
      fullPage: true,
    });
  }
});
