import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimSearchDraft, createSearchDraft } from "../../../db/search-draft-store.js";
import { SearchDraftService } from "./search-draft.service";

vi.mock("../../../db/search-draft-store.js", () => ({
  claimSearchDraft: vi.fn(),
  createSearchDraft: vi.fn(),
}));

const draft = {
  id: "9f2e7c70-1d5e-46f4-87c4-75e3b4e7a201",
  user_id: null,
  guest_key: "guest-key-1234567890",
  email_hint: "traveler@horizon.local",
  prompt_text: "Đà Nẵng 4 ngày",
  search_payload: { cities: ["da-nang"] },
  status: "pending" as const,
  created_at: "2026-07-16T00:00:00.000Z",
};

describe("SearchDraftService", () => {
  const service = new SearchDraftService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a search draft through the repository", async () => {
    vi.mocked(createSearchDraft).mockResolvedValue(draft);

    await expect(
      service.create({
        guest_key: draft.guest_key!,
        email_hint: draft.email_hint!,
        prompt_text: draft.prompt_text!,
        search_payload: draft.search_payload,
      })
    ).resolves.toEqual(draft);
  });

  it("maps unclaimable drafts to not_found", async () => {
    vi.mocked(claimSearchDraft).mockResolvedValue(null);

    await expect(
      service.claim({
        draftId: draft.id,
        userId: "user-1",
        dto: { guest_key: draft.guest_key! },
      })
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "not_found",
        statusCode: 404,
        message: "Search draft not found or expired",
      },
    });
  });
});
