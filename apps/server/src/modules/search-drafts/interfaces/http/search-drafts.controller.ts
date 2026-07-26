import { Body, Controller, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { SearchDraftsService } from "../../application/search-drafts.service.js";
import type { SearchDraft } from "../../domain/search-draft.entity.js";
import { ClaimSearchDraftDto, CreateSearchDraftDto, SearchDraftParamsDto } from "../../dto/search-draft.dto.js";

@Controller("api/search-drafts")
export class SearchDraftsController {
  constructor(@Inject(SearchDraftsService) private readonly drafts: SearchDraftsService) {}

  @Post()
  async create(@Body() dto: CreateSearchDraftDto) {
    return toSearchDraftResponse(await this.drafts.create(dto));
  }

  @Post(":id/claim")
  @UseGuards(JwtAuthGuard)
  async claim(
    @Param() params: SearchDraftParamsDto,
    @Body() dto: ClaimSearchDraftDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await this.drafts.claim({ draftId: params.id, userId: user.sub, dto });
    if (!result.ok) throwServiceError(result.error);
    return toSearchDraftResponse(result.value);
  }
}

export function toSearchDraftResponse(draft: SearchDraft) {
  return {
    id: draft.id,
    user_id: draft.userId,
    guest_key: draft.guestKey,
    email_hint: draft.emailHint,
    prompt_text: draft.promptText,
    search_payload: draft.searchPayload,
    status: draft.status,
    created_at: draft.createdAt,
  };
}
