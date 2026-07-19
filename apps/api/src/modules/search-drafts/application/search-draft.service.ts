import { claimSearchDraft, createSearchDraft, type SearchDraft } from "../../../db/search-draft-store.js";
import { notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import type { ClaimSearchDraftDto, CreateSearchDraftDto } from "../dto/search-draft.dto.js";

export class SearchDraftService {
  create(dto: CreateSearchDraftDto): Promise<SearchDraft> {
    return createSearchDraft({
      guestKey: dto.guest_key,
      emailHint: dto.email_hint,
      promptText: dto.prompt_text,
      searchPayload: dto.search_payload,
    });
  }

  async claim(input: {
    draftId: string;
    userId: string;
    dto: ClaimSearchDraftDto;
  }): Promise<ServiceResult<SearchDraft>> {
    const draft = await claimSearchDraft({
      draftId: input.draftId,
      guestKey: input.dto.guest_key,
      userId: input.userId,
    });

    return draft ? ok(draft) : notFound("Search draft not found or expired");
  }
}

export const searchDraftService = new SearchDraftService();
