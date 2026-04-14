import { expect, test } from "@playwright/test";
import { queuedScenario } from "../fixtures/index.mjs";

test.describe("web share and save contract flows", () => {
  test("share button is clickable on itinerary page", async ({ page }) => {
    await page.goto(`/itinerary/${queuedScenario.itineraryId}`);

    const shareButton = page.getByRole("button", { name: "Share" });
    await expect(shareButton).toBeVisible();
    await shareButton.click();
    await expect(shareButton).toBeEnabled();
  });

  test("save and share endpoints are consistent with contract", async ({ request }) => {
    const authHeaders = { Authorization: "Bearer e2e-user-1" };

    const saveResponse = await request.post(
      `http://127.0.0.1:3101/api/itinerary/${queuedScenario.itineraryId}/save`,
      { headers: authHeaders }
    );
    expect(saveResponse.ok()).toBeTruthy();
    const savePayload = await saveResponse.json();
    expect(savePayload).toMatchObject({ saved: true });

    const shareResponse = await request.patch(
      `http://127.0.0.1:3101/api/itinerary/${queuedScenario.itineraryId}/share`,
      {
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        data: { is_public: true },
      }
    );

    expect(shareResponse.ok()).toBeTruthy();
    const sharePayload = await shareResponse.json();
    expect(typeof sharePayload.share_token).toBe("string");
    expect(sharePayload.share_token.length).toBeGreaterThan(0);

    const sharedResponse = await request.get(
      `http://127.0.0.1:3101/api/itinerary/shared/${sharePayload.share_token}`
    );
    expect(sharedResponse.ok()).toBeTruthy();

    const sharedPayload = await sharedResponse.json();
    expect(sharedPayload.itineraries?.[0]?.title).toBe(
      queuedScenario.itinerary.itineraries[0].title
    );
  });
});
