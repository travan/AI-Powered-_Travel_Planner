import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { UsersService } from "../../application/users.service.js";
import { PromptHistoryQueryDto, UserIdParamsDto } from "../../dto/user.dto.js";

@Controller("api/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: CurrentUserValue) {
    const result = await this.users.getProfile(user.sub);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get("me/prompt-history")
  @UseGuards(JwtAuthGuard)
  promptHistory(
    @CurrentUser() user: CurrentUserValue,
    @Query() query: PromptHistoryQueryDto
  ) {
    return this.users.listPromptHistory({ userId: user.sub, limit: query.limit });
  }

  @Get(":id")
  async getById(@Param() params: UserIdParamsDto) {
    const result = await this.users.getProfile(params.id);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
