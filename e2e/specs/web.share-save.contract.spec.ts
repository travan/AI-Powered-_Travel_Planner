import { expect, test } from "@playwright/test";
import { queuedScenario } from "../fixtures/index.mjs";
import {
  API_BASE_URL,
  apiJsonHeaders,
  apiAuthHeaders,
} from "./helpers/e2e-helpers";

test.describe("web share and save contract flows", () => {
  test("share button is clickable on itinerary page", async ({ page }) => {
    await page.goto(`/itinerary/${queuedScenario.itineraryId}`);

    const shareButton = page.getByRole("button", { name: "Share" });
    await expect(shareButton).toBeVisible();
    await shareButton.click();
    await expect(shareButton).toBeEnabled();
  });

  test("save and share endpoints are consistent with contract", async ({ request }) => {
    const saveResponse = await request.post(
      `${API_BASE_URL}/api/itinerary/${queuedScenario.itineraryId}/save`,
      { headers: apiAuthHeaders() }
    );
    expect(saveResponse.ok()).toBeTruthy();
    const savePayload = await saveResponse.json();
    expect(savePayload).toMatchObject({ saved: true });

    const shareResponse = await request.patch(
      `${API_BASE_URL}/api/itinerary/${queuedScenario.itineraryId}/share`,
      {
        headers: apiJsonHeaders(),
        data: { is_public: true },
      }
    );

    expect(shareResponse.ok()).toBeTruthy();
    const sharePayload = await shareResponse.json();
    expect(typeof sharePayload.share_token).toBe("string");
    expect(sharePayload.share_token.length).toBeGreaterThan(0);

    const sharedResponse = await request.get(
      `${API_BASE_URL}/api/itinerary/shared/${sharePayload.share_token}`
    );
    expect(sharedResponse.ok()).toBeTruthy();

    const sharedPayload = await sharedResponse.json();
    expect(sharedPayload.itineraries?.[0]?.title).toBe(
      queuedScenario.itinerary.itineraries[0].title
    );
  });
});
