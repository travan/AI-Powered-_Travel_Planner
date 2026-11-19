import { expect, test, type Page } from "./helpers/test-fixtures";
import { cachedScenario } from "../fixtures/index.mjs";
import {
  API_BASE_URL,
  clearWebMockAuthSession,
  clickDetailFromTripsOverview,
  clickGenerate,
  expectItineraryPage,
  expectTripsOverviewPage,
  searchCity,
  signUpOnWeb,
} from "./helpers/e2e-helpers";

const tripId = "11111111-1111-4111-8111-111111111111";
const catalogActivityId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

type MockSession = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: {
    id: string;
    email: string;
    user_metadata: { full_name?: string };
  };
};

function makeSession(
  userId: string,
  email: string,
  fullName: string,
): MockSession {
  return {
    access_token: userId,
    refresh_token: `full-flow-refresh-${userId}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: userId,
      email,
      user_metadata: { full_name: fullName },
    },
  };
}

async function readSession(page: Page) {
  return page.evaluate(() => {
    const value = window.localStorage.getItem("horizon.mock.auth.session");
    if (!value) throw new Error("Expected a mock web session");
    return JSON.parse(value) as MockSession;
  });
}

async function useSession(page: Page, session: MockSession) {
  await page.goto("/plan");
  await page.evaluate((nextSession) => {
    window.localStorage.setItem(
      "horizon.mock.auth.session",
      JSON.stringify(nextSession),
    );
    window.localStorage.removeItem("horizon.local.auth.session");
    document.cookie = `horizon_mock_auth=${encodeURIComponent(
      JSON.stringify(nextSession),
    )}; Path=/; Max-Age=86400; SameSite=Lax`;
    document.cookie =
      "horizon_local_auth=; Path=/; Max-Age=0; SameSite=Lax";
  }, session);
}

test("guest can complete the web journey through collaboration and a selected-participant bill", async ({
  page,
  request,
}) => {
  test.slow();
  await request.post(`${API_BASE_URL}/__e2e/reset-business-fixtures`);

  const identity = {
    fullName: "Full Flow Host",
    email: `full-flow-${Date.now()}@horizon.mock`,
    password: "secret123",
  };

  await test.step("guest search is preserved through signup", async () => {
    await page.goto("/plan");
    await clearWebMockAuthSession(page);
    await page.reload();

    await searchCity(page, cachedScenario.city);
    await clickGenerate(page);
    await expect(page).toHaveURL(/\/login\?redirectTo=/);

    await page.getByTestId("web-auth-tab-signup").click();
    await expect(page).toHaveURL(/\/signup\?redirectTo=/);
    await signUpOnWeb(page, identity);

    await expectTripsOverviewPage(page);
    await expect(page.getByTestId("web-itinerary-title")).toHaveText(
      cachedScenario.itinerary.itineraries[0].title,
    );
  });

  let hostSession: MockSession;
  await test.step("generated itinerary opens and saves into a real workspace route", async () => {
    hostSession = await readSession(page);
    await clickDetailFromTripsOverview(page);
    await expectItineraryPage(
      page,
      cachedScenario.itineraryId,
      cachedScenario.itinerary.itineraries[0].title,
    );

    await page.getByTestId("save-trip").click();
    await expect(page).toHaveURL(
      new RegExp(`/trips/${tripId}/workspace$`),
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("web-trip-workspace")).toBeVisible();
    await expect(page.getByText("Your rolehost", { exact: true })).toBeVisible();
  });

  let inviteToken = "";
  await test.step("host creates a contributor invite and share link", async () => {
    await page.getByTestId("web-workspace-tab-members").click();
    await expect(page.getByTestId("web-members-list")).toContainText(
      "Host Traveler",
    );
    await expect(page.getByTestId("web-members-list")).toContainText(
      "Viewer Traveler",
    );
    await expect(page.getByTestId("web-members-list")).toContainText(
      "Full Flow",
    );

    await page.getByTestId("web-invite-email").fill("friend@example.com");
    await page
      .getByTestId("web-invite-role")
      .selectOption("contributor");
    await page.getByTestId("web-create-invite").click();
    inviteToken = (await page.getByTestId("web-invite-token").textContent())?.trim() ?? "";
    expect(inviteToken).toContain("invite-token");

    await page.getByTestId("web-share-role").selectOption("viewer");
    await page.getByTestId("web-enable-share").click();
    await expect(page.getByTestId("web-share-link")).toContainText(
      "/trips/join",
    );
  });

  const contributorSession = makeSession(
    "full-flow-friend",
    "friend@example.com",
    "Flow Friend",
  );

  await test.step("contributor joins and receives contributor-only navigation", async () => {
    await useSession(page, contributorSession);
    await page.goto(
      `/trips/join?token=${encodeURIComponent(inviteToken)}&type=invite`,
    );
    await page.getByTestId("web-trip-join-submit").click();
    await expect(page.getByTestId("web-trip-join-message")).toContainText(
      "contributor",
    );
    await page.getByTestId("web-trip-join-open-workspace").click();

    await expect(page.getByTestId("web-trip-workspace")).toBeVisible();
    await expect(page.getByTestId("web-workspace-tab-members")).toBeVisible();
    await expect(page.getByTestId("web-workspace-tab-schedule")).toBeVisible();
    await expect(page.getByTestId("web-workspace-tab-bills")).toBeVisible();
    await expect(page.getByTestId("web-workspace-tab-review")).toHaveCount(0);
    await expect(page.getByTestId("web-workspace-tab-audit")).toHaveCount(0);

    await page.getByTestId("web-workspace-tab-members").click();
    await expect(page.getByTestId("web-read-only-notice")).toBeVisible();
    await expect(page.getByTestId("web-create-invite")).toHaveCount(0);
  });

  await test.step("viewer sees only read-only trip essentials", async () => {
    await useSession(
      page,
      makeSession("e2e-user-2", "viewer@example.com", "Viewer Traveler"),
    );
    await page.goto(`/trips/${tripId}/workspace`);
    await expect(page.getByTestId("web-trip-workspace")).toBeVisible();
    await expect(page.getByTestId("web-workspace-tab-schedule")).toBeVisible();
    await expect(page.getByTestId("web-workspace-tab-members")).toHaveCount(0);
    await expect(page.getByTestId("web-workspace-tab-bills")).toHaveCount(0);
    await expect(page.getByTestId("web-workspace-tab-review")).toHaveCount(0);
    await expect(page.getByTestId("web-workspace-tab-audit")).toHaveCount(0);
  });

  await test.step("host promotes the contributor and co-host gets management access", async () => {
    await useSession(page, hostSession!);
    await page.goto(`/trips/${tripId}/workspace`);
    await page.getByTestId("web-workspace-tab-members").click();
    await expect(
      page.getByTestId("web-member-role-full-flow-friend"),
    ).toBeVisible();
    await page
      .getByTestId("web-member-role-full-flow-friend")
      .selectOption("co_host");
    await page.getByTestId("web-member-save-full-flow-friend").click();
    await expect(page.getByTestId("web-workspace-message")).toContainText(
      "updated",
    );

    await useSession(page, contributorSession);
    await page.goto(`/trips/${tripId}/workspace`);
    await expect(page.getByTestId("web-workspace-tab-review")).toBeVisible();
    await expect(page.getByTestId("web-workspace-tab-audit")).toBeVisible();
    await page.getByTestId("web-workspace-tab-members").click();
    await expect(page.getByTestId("web-create-invite")).toBeVisible();
  });

  await test.step("host creates schedule and transport for named participants", async () => {
    await useSession(page, hostSession!);
    await page.goto(`/trips/${tripId}/workspace`);

    await page.getByTestId("web-workspace-tab-schedule").click();
    await page
      .getByTestId(`web-add-catalog-activity-${catalogActivityId}`)
      .click();
    await expect(page.getByTestId("web-trip-activities-list")).toContainText(
      "Hoi An lantern workshop",
    );

    await page.getByTestId("web-workspace-tab-transport").click();
    await page.getByTestId("web-transport-origin").fill("Da Nang Station");
    await page
      .getByTestId("web-transport-destination")
      .fill("Hoi An Old Town");
    await page.getByTestId("web-transport-provider").fill("E2E Shuttle");
    await page.getByTestId("web-transport-price").fill("240000");
    await page
      .getByTestId(`web-transport-participant-${hostSession!.user.id}`)
      .check({ force: true });
    await page
      .getByTestId("web-transport-participant-full-flow-friend")
      .check({ force: true });
    await page.getByTestId("web-create-transport").click();

    await expect(page.getByTestId("web-transport-list")).toContainText(
      "Da Nang Station",
    );
    await expect(page.getByTestId("web-transport-list")).toContainText(
      "Participants: 2",
    );
  });

  await test.step("bill is split only across the selected travelers", async () => {
    await page.getByTestId("web-workspace-tab-bills").click();
    await page.getByTestId("web-bill-activity").selectOption({ index: 1 });
    await page
      .getByTestId("web-bill-merchant")
      .fill("Hoi An Lantern Studio");
    await page.getByTestId("web-bill-total").fill("600000");
    await page
      .getByTestId("web-bill-raw-text")
      .fill("Hoi An Lantern Studio lantern workshop total 600000 VND");
    await page.getByTestId("web-create-bill").click();
    await expect(page.getByTestId("web-bill-list")).toContainText(
      "Hoi An Lantern Studio",
    );

    await page.getByTestId("web-expense-participants-clear").click();
    await page
      .getByTestId(`web-expense-participant-${hostSession!.user.id}`)
      .check({ force: true });
    await page
      .getByTestId("web-expense-participant-full-flow-friend")
      .check({ force: true });
    await expect(
      page.getByTestId("web-expense-participant-count"),
    ).toContainText("2 of 4 selected");
    await expect(page.getByTestId("web-equal-split-preview")).toContainText(
      "300",
    );

    await page.getByTestId("web-create-expense").click();
    await expect(page.getByTestId("web-workspace-message")).toContainText(
      "2 splits",
    );
    await expect(page.getByTestId("web-expense-list")).toContainText(
      "Hoi An Lantern Studio payment",
    );
    await expect(page.getByTestId("web-expense-list")).toContainText(
      "2 participants",
    );
    const selectedSplits = page
      .locator("[data-testid^='web-expense-splits-']")
      .first();
    await expect(selectedSplits).toContainText("Full Flow Friend");
    await expect(selectedSplits).not.toContainText("Viewer Traveler");
    await expect(
      page.locator("[data-testid^='web-bill-participants-']").first(),
    ).toContainText("2 participants");

    await page
      .locator("[data-testid^='web-bill-analyze-']")
      .first()
      .click();
    await page.getByTestId("web-workspace-tab-insights").click();
    await expect(page.getByTestId("web-ocr-merchant")).toContainText(
      "Hoi An Lantern Studio",
    );
  });

  await test.step("host review, audit, and saved-trip reopening work", async () => {
    await page.getByTestId("web-workspace-tab-review").click();
    const approveExpense = page
      .locator("[data-testid^='web-review-approve-expense-']")
      .first();
    await expect(approveExpense).toBeVisible();
    await approveExpense.click();
    await expect(page.getByTestId("web-workspace-message")).toContainText(
      "approved",
    );

    await page.getByTestId("web-workspace-tab-audit").click();
    await expect(page.getByTestId("web-audit-list")).toContainText("created");
    await expect(page.getByTestId("web-audit-list")).toContainText(
      "host_approved",
    );

    await page.goto("/trips");
    await expect(page.getByTestId("web-trip-card")).toContainText(
      "Cache City Escape",
    );
    await page.getByTestId("web-trip-card").click();
    await expect(page).toHaveURL(new RegExp(`/trips/${tripId}/workspace$`));
    await expect(page.getByTestId("web-trip-workspace")).toBeVisible();
  });
});
