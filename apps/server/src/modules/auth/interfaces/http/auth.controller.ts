import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, type CurrentUserValue } from "../../../../shared/nest/current-user.decorator.js";
import { getBearerToken, JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { LocalJwtService } from "../../../../shared/nest/local-jwt.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { AuthService } from "../../application/auth.service.js";
import { AccountExistsQueryDto, LoginDto, SignupDto } from "../../dto/auth.dto.js";

@Controller("api/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(LocalJwtService) private readonly jwt: LocalJwtService
  ) {}

  @Get("account-exists")
  async accountExists(@Query() query: AccountExistsQueryDto) {
    return { exists: await this.auth.accountExists(query.email) };
  }

  @Post("register")
  async register(@Body() dto: SignupDto) {
    const result = await this.auth.signup({ dto, jwt: this.jwt });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post("session")
  @HttpCode(200)
  async createSession(@Body() dto: LoginDto) {
    const result = await this.auth.login({ dto, jwt: this.jwt });
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: CurrentUserValue) {
    const result = await this.auth.getMe(user.sub);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logout(@Headers("authorization") authorization: string | undefined) {
    return this.auth.logout(getBearerToken(authorization));
  }
}
