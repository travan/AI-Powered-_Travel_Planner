import { Inject, Injectable } from "@nestjs/common";
import { notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import type { ClaimSearchDraftDto, CreateSearchDraftDto } from "../dto/search-draft.dto.js";
import type { SearchDraft } from "../domain/search-draft.entity.js";
import { SEARCH_DRAFT_REPOSITORY, type SearchDraftRepository } from "../domain/search-draft.repository.js";

@Injectable()
export class SearchDraftsService {
  constructor(@Inject(SEARCH_DRAFT_REPOSITORY) private readonly drafts: SearchDraftRepository) {}

  create(dto: CreateSearchDraftDto): Promise<SearchDraft> {
    return this.drafts.create({
      guestKey: dto.guest_key,
      emailHint: dto.email_hint,
      promptText: dto.prompt_text,
      searchPayload: dto.search_payload,
    });
  }

  async claim(input: { draftId: string; userId: string; dto: ClaimSearchDraftDto }): Promise<ServiceResult<SearchDraft>> {
    const draft = await this.drafts.claim({
      draftId: input.draftId,
      guestKey: input.dto.guest_key,
      userId: input.userId,
    });
    return draft ? ok(draft) : notFound("Search draft not found or expired");
  }
}
