import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { searchDraftService } from "../../application/search-draft.service.js";
import {
  claimSearchDraftDto,
  createSearchDraftDto,
  searchDraftParamsDto,
  type ClaimSearchDraftDto,
  type CreateSearchDraftDto,
} from "../../dto/search-draft.dto.js";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { ZodValidationPipe } from "../../../../shared/nest/zod-validation.pipe.js";

@Controller("api/search-drafts")
export class SearchDraftsController {
  @Post()
  async create(@Body(new ZodValidationPipe(createSearchDraftDto)) dto: CreateSearchDraftDto) {
    return searchDraftService.create(dto);
  }

  @Post(":id/claim")
  @UseGuards(JwtAuthGuard)
  async claim(
    @Param(new ZodValidationPipe(searchDraftParamsDto)) params: { id: string },
    @Body(new ZodValidationPipe(claimSearchDraftDto)) dto: ClaimSearchDraftDto,
    @CurrentUser() user: CurrentUserValue
  ) {
    const result = await searchDraftService.claim({
      draftId: params.id,
      userId: user.sub,
      dto,
    });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
