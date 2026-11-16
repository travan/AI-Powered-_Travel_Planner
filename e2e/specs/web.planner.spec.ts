import { expect, test } from "@playwright/test";
import { cachedScenario } from "../fixtures/index.mjs";
import { injectWebMockAuthSession } from "./helpers/e2e-helpers";

test("quota recovery reports the expected reset and disables premature legacy retries", async ({
  page,
}) => {
  await page.goto("/plan");
  await injectWebMockAuthSession(page, "quota-legacy-user");
  const reset = new Date();
  reset.setUTCHours(24, 0, 0, 0);
  await page.route("**/api/itinerary/jobs/quota-legacy", async (route) =>
    route.fulfill({
      json: {
        id: "quota-legacy",
        kind: "generate",
        status: "failed",
        stage: "failed",
        attempts: 1,
        pipeline_version: 1,
        error_code: "AI_QUOTA_EXHAUSTED",
        error_params: { retry_at: reset.toISOString() },
      },
    }),
  );
  await page.goto("/plan/jobs/quota-legacy");
  await expect(
    page.getByRole("heading", { name: "AI allowance exhausted" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Expected reset:");
  await expect(page.getByRole("status")).toContainText("Vietnam time");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeDisabled();
});

test("quota recovery does not invent a reset or retry a consumed V2 job", async ({
  page,
}) => {
  await page.goto("/plan");
  await injectWebMockAuthSession(page, "quota-v2-user");
  await page.route("**/api/itinerary/jobs/quota-v2", async (route) =>
    route.fulfill({
      json: {
        id: "quota-v2",
        kind: "generate",
        status: "failed",
        stage: "failed",
        attempts: 1,
        pipeline_version: 2,
        error_code: "AI_QUOTA_EXHAUSTED",
        error_params: {},
      },
    }),
  );
  await page.goto("/plan/jobs/quota-v2");
  await expect(
    page.getByRole("heading", { name: "AI allowance exhausted" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "recovery time is not yet known",
  );
  await expect(page.getByRole("status")).not.toContainText("Expected reset:");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Create a new request", exact: true }),
  ).toHaveAttribute("href", "/plan");
});

test("structured planner preserves calendar, budget and locale through polling to a saved trip", async ({
  page,
}) => {
  await page.goto("/plan");
  await injectWebMockAuthSession(page, "planner-calendar-user");
  await page
    .getByRole("textbox", { name: "Where from?", exact: true })
    .fill("Hà Nội");
  await page.getByTestId("web-plan-city-input").fill(cachedScenario.city);
  await page
    .getByTestId("planner-optional-settings")
    .locator("summary")
    .first()
    .click();
  await page
    .getByRole("combobox", { name: "Currency", exact: true })
    .selectOption("VND");
  await page
    .getByRole("spinbutton", { name: "Group budget (VND)", exact: true })
    .fill("8000000");
  await page.getByRole("button", { name: "Mid-range", exact: true }).click();
  await page.getByRole("button", { name: "More adults", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Travel dates", exact: true })
    .selectOption("dates");
  await page
    .getByRole("button", { name: "Choose Departure date", exact: true })
    .click();
  await page.getByLabel("Choose the Month").selectOption("0");
  await page.getByLabel("Choose the Year").selectOption("2027");
  await page.locator('dialog[open] [data-day="2027-01-02"] button').click();
  await expect(
    page.getByRole("textbox", { name: "Return date", exact: true }),
  ).toHaveValue("03/01/2027");
  await page
    .getByRole("button", { name: "Choose Return date", exact: true })
    .click();
  await expect(
    page.locator('dialog[open] [data-day="2027-01-02"] button'),
  ).toBeDisabled();
  await page.locator('dialog[open] [data-day="2027-01-06"] button').click();
  await page
    .getByRole("button", { name: "Choose Departure date", exact: true })
    .click();
  await page.locator('dialog[open] [data-day="2027-01-08"] button').click();
  await expect(
    page.getByRole("textbox", { name: "Return date", exact: true }),
  ).toHaveValue("09/01/2027");
  await page.getByRole("button", { name: "VI", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", {
      name: "Ngân sách cả nhóm (VND)",
      exact: true,
    }),
  ).toHaveValue("8000000");
  let submitted: any;
  let polls = 0;
  await page.route("**/api/itinerary/generate", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({
      json: {
        status: "queued",
        job_id: "calendar-job",
        stream_url: "/api/itinerary/jobs/calendar-job",
      },
    });
  });
  await page.route("**/api/itinerary/jobs/calendar-job", async (route) => {
    polls++;
    await route.fulfill({
      json: {
        id: "calendar-job",
        status: polls === 1 ? "processing" : "complete",
        stage: polls === 1 ? "validation" : "complete",
        itinerary_id: polls === 1 ? null : cachedScenario.itineraryId,
      },
    });
  });
  await page.getByTestId("web-plan-generate").click();
  await expect(page).toHaveURL(/\/plan\/jobs\/calendar-job/);
  await expect(page).toHaveURL(
    new RegExp(`/itinerary/${cachedScenario.itineraryId}`),
    { timeout: 20000 },
  );
  expect(submitted).toMatchObject({
    start_date: "2027-01-08",
    end_date: "2027-01-09",
    budget: 8000000,
    currency: "VND",
    trip_style: "mid_range",
    num_travelers: 3,
    locale: "vi",
  });
  expect(polls).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId("web-itinerary-title")).toHaveText(
    cachedScenario.itinerary.itineraries[0].title,
  );
  await page.getByTestId("save-trip").click();
  await expect(page).toHaveURL(/\/trips\/[^/]+\/workspace/);
  await expect(page.getByTestId("web-trip-workspace")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
  ).toBe(false);
});
