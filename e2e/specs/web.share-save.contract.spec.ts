import { expect, test } from "./helpers/test-fixtures";
import { queuedScenario } from "../fixtures/index.mjs";
import {
  API_BASE_URL,
  apiJsonHeaders,
  apiAuthHeaders,
  injectWebMockAuthSession,
} from "./helpers/e2e-helpers";

test.describe("web share and save contract flows", () => {
  test("owner creates a public read-only link, copies it, and revokes anonymous access", async ({
    page,
    browser,
  }) => {
    await page.goto("/plan");
    await injectWebMockAuthSession(page, "share-user");
    await page.goto(`/itinerary/${queuedScenario.itineraryId}`);

    const shareButton = page.getByRole("button", { name: "Share" });
    await expect(shareButton).toBeVisible();
    await shareButton.click();
    await expect(
      page.getByRole("button", { name: "Create link", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Create link", exact: true })
      .click();
    const field = page.getByLabel("Share link", { exact: true });
    await expect(field).toHaveValue(/\/shared\/[\w-]{43}$/);
    const url = await field.inputValue();
    await page.getByRole("button", { name: "Copy link", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Link copied!");
    const anonymous = await browser.newContext();
    const visitor = await anonymous.newPage();
    try {
      await visitor.goto(url);
      await expect(
        visitor.getByText("Shared itinerary · Read only"),
      ).toBeVisible();
      await expect(
        visitor.getByRole("heading", {
          name: queuedScenario.itinerary.itineraries[0].title,
        }),
      ).toBeVisible();
      await expect(
        visitor.getByRole("button", { name: "Share", exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Disable sharing", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Sharing is disabled.",
      );
      const response = await visitor.reload();
      expect(response?.status()).toBe(404);
    } finally {
      await anonymous.close();
    }
  });

  test("save and share endpoints are consistent with contract", async ({
    request,
  }) => {
    const saveResponse = await request.post(
      `${API_BASE_URL}/api/itinerary/${queuedScenario.itineraryId}/save`,
      { headers: apiAuthHeaders() },
    );
    expect(saveResponse.ok()).toBeTruthy();
    const savePayload = await saveResponse.json();
    expect(savePayload).toMatchObject({ saved: true });

    const shareResponse = await request.patch(
      `${API_BASE_URL}/api/itinerary/${queuedScenario.itineraryId}/share`,
      {
        headers: apiJsonHeaders(),
        data: { is_public: true },
      },
    );

    expect(shareResponse.ok()).toBeTruthy();
    const sharePayload = await shareResponse.json();
    expect(typeof sharePayload.share_token).toBe("string");
    expect(sharePayload.share_token.length).toBeGreaterThan(0);

    const sharedResponse = await request.get(
      `${API_BASE_URL}/api/itinerary/shared/${sharePayload.share_token}`,
    );
    expect(sharedResponse.ok()).toBeTruthy();

    const sharedPayload = await sharedResponse.json();
    expect(sharedPayload.itineraries?.[0]?.title).toBe(
      queuedScenario.itinerary.itineraries[0].title,
    );
  });
});
