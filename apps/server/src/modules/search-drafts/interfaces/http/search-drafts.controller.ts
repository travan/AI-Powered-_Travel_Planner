import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { SearchDraftsService } from "../../application/search-drafts.service.js";
import { ClaimSearchDraftDto, CreateSearchDraftDto, SearchDraftParamsDto } from "../../dto/search-draft.dto.js";

@Controller("api/search-drafts")
export class SearchDraftsController {
  constructor(private readonly drafts: SearchDraftsService) {}

  @Post()
  create(@Body() dto: CreateSearchDraftDto) {
    return this.drafts.create(dto);
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
    return result.value;
  }
}
