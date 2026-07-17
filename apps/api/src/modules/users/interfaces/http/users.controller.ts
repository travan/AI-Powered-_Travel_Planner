import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { userService } from "../../application/user.service.js";
import { promptHistoryQueryDto } from "../../dto/user.dto.js";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { ZodValidationPipe } from "../../../../shared/nest/zod-validation.pipe.js";

@Controller("api/users")
export class UsersController {
  @Get("me/prompt-history")
  @UseGuards(JwtAuthGuard)
  async promptHistory(
    @CurrentUser() user: CurrentUserValue,
    @Query(new ZodValidationPipe(promptHistoryQueryDto)) query: { limit: number }
  ) {
    return userService.getPromptHistory(user.sub, query.limit);
  }
}
