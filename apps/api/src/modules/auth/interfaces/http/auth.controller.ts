import { Body, Controller, Get, Headers, HttpCode, Post, Query, UseGuards } from "@nestjs/common";
import { authService } from "../../application/auth.service.js";
import { accountExistsQueryDto, loginDto, signupDto, type LoginDto, type SignupDto } from "../../dto/auth.dto.js";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { getBearerToken, JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { localJwtSigner } from "../../../../shared/nest/local-jwt.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { ZodValidationPipe } from "../../../../shared/nest/zod-validation.pipe.js";

@Controller("api/auth")
export class AuthController {
  @Get("account-exists")
  async accountExists(@Query(new ZodValidationPipe(accountExistsQueryDto)) query: { email: string }) {
    return { exists: await authService.accountExists(query.email) };
  }

  @Post("register")
  async register(@Body(new ZodValidationPipe(signupDto)) dto: SignupDto) {
    const result = await authService.signup({ dto, jwt: localJwtSigner });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post("session")
  @HttpCode(200)
  async createSession(@Body(new ZodValidationPipe(loginDto)) dto: LoginDto) {
    const result = await authService.login({ dto, jwt: localJwtSigner });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: CurrentUserValue) {
    const result = await authService.getMe(user.sub);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logout(@Headers("authorization") authorization: string | undefined) {
    return authService.logout(getBearerToken(authorization));
  }
}
