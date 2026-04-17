import { test } from "@playwright/test";
import { queuedScenario } from "../fixtures/index.mjs";
import {
  verifyMobileProfileFallback,
  verifyQueuedMobileRoute,
  verifyMobileSavedFallback,
} from "./helpers/e2e-helpers";

test.describe("mobile web contract flows", () => {
  test("queued itinerary route renders detail from the job endpoint", async ({
    page,
  }) => {
    await verifyQueuedMobileRoute(
      page,
      queuedScenario.jobId,
      queuedScenario.itinerary.itineraries[0].title
    );
  });

  test("profile and saved tabs degrade gracefully without Supabase env", async ({
    page,
  }) => {
    await verifyMobileProfileFallback(page);
    await verifyMobileSavedFallback(page);
  });
});
