import { describe, expect, it } from "vitest";
import { toSearchDraftResponse } from "../../../../apps/server/src/modules/search-drafts/interfaces/http/search-drafts.controller.js";

describe("toSearchDraftResponse", () => {
  it("preserves the public snake_case API contract used by the web resume flow", () => {
    expect(
      toSearchDraftResponse({
        id: "draft-1",
        userId: "user-1",
        guestKey: "guest-key-123456",
        emailHint: "traveler@example.com",
        promptText: "Plan a trip to Da Nang",
        searchPayload: { cities: ["da-nang"] },
        status: "claimed",
        createdAt: "2026-07-26T00:00:00.000Z",
      })
    ).toEqual({
      id: "draft-1",
      user_id: "user-1",
      guest_key: "guest-key-123456",
      email_hint: "traveler@example.com",
      prompt_text: "Plan a trip to Da Nang",
      search_payload: { cities: ["da-nang"] },
      status: "claimed",
      created_at: "2026-07-26T00:00:00.000Z",
    });
  });
});
