import { beforeEach, describe, expect, it, vi } from "vitest";
const search_draft_dto_1 = await import("../../../../../../../../apps/api/dist/modules/search-drafts/dto/search-draft.dto");
describe("search draft DTO validation", () => {
    it("validates draft identifiers as UUIDs", () => {
        expect(search_draft_dto_1.searchDraftParamsDto.safeParse({ id: "9f2e7c70-1d5e-46f4-87c4-75e3b4e7a201" }).success).toBe(true);
        expect(search_draft_dto_1.searchDraftParamsDto.safeParse({ id: "not-a-uuid" }).success).toBe(false);
    });
    it("normalizes create and claim payloads", () => {
        const guestKey = "guest-key-1234567890";
        expect(search_draft_dto_1.createSearchDraftDto.parse({
            guest_key: `  ${guestKey}  `,
            email_hint: "  Traveler@Horizon.Local ",
            prompt_text: "  Đà Nẵng 4 ngày  ",
            search_payload: { cities: ["da-nang"], num_days: 4 },
        })).toMatchObject({
            guest_key: guestKey,
            email_hint: "traveler@horizon.local",
            prompt_text: "Đà Nẵng 4 ngày",
        });
        expect(search_draft_dto_1.claimSearchDraftDto.safeParse({ guest_key: "too-short" }).success).toBe(false);
    });
});
