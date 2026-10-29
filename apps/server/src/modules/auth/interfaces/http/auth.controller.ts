import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  UseGuards,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  authResponse,
  assertBrowserRequest,
  clearSessionCookies,
  readCookie,
} from "./session-cookies.js";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../../domain/session.js";
import {
  CurrentUser,
  type CurrentUserValue,
} from "../../../../shared/nest/current-user.decorator.js";
import {
  getBearerToken,
  JwtAuthGuard,
} from "../../../../shared/nest/jwt-auth.guard.js";
import { LocalJwtService } from "../../../../shared/nest/local-jwt.js";
import {
  throwHttpError,
  throwServiceError,
} from "../../../../shared/nest/http-errors.js";
import { AuthService } from "../../application/auth.service.js";
import {
  AccountExistsQueryDto,
  LoginDto,
  SignupDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshDto,
} from "../../dto/auth.dto.js";

import { PasswordRecoveryService } from "../../application/password-recovery.service.js";

@Controller("api/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(PasswordRecoveryService)
    private readonly recovery: PasswordRecoveryService,
    @Inject(LocalJwtService) private readonly jwt: LocalJwtService,
  ) {}

  @Post("forgot-password")
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.recovery.request(dto.email);
  }

  @Post("reset-password")
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.recovery.reset(dto.token, dto.password);
  }

  @Get("account-exists")
  async accountExists(@Query() query: AccountExistsQueryDto) {
    return { exists: await this.auth.accountExists(query.email) };
  }

  @Post("register")
  async register(
    @Body() dto: SignupDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (request.headers["x-auth-client"] === "web")
      assertBrowserRequest(request);
    const result = await this.auth.signup({ dto, jwt: this.jwt });
    if (!result.ok) throwServiceError(result.error);
    return authResponse(result.value, request, response);
  }

  @Post("session")
  @HttpCode(200)
  async createSession(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (request.headers["x-auth-client"] === "web")
      assertBrowserRequest(request);
    const result = await this.auth.login({ dto, jwt: this.jwt });
    if (!result.ok) throwServiceError(result.error);
    return authResponse(result.value, request, response);
  }

  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const browser = request.headers["x-auth-client"] === "web";
    if (browser || !dto.refresh_token) assertBrowserRequest(request);
    const token = browser
      ? readCookie(request, REFRESH_COOKIE)
      : dto.refresh_token;
    const result = await this.auth.refresh(token ?? "", this.jwt);
    if (!result.ok) {
      if (browser) clearSessionCookies(request, response);
      throwServiceError(result.error);
    }
    return authResponse(result.value, request, response);
  }

  @Post("restore")
  @HttpCode(200)
  async restore(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertBrowserRequest(request);
    response.setHeader("Cache-Control", "no-store");
    const token = readCookie(request, ACCESS_COOKIE) ?? "";
    const claims = this.jwt.verify(token);
    if (!claims || typeof claims.exp !== "number")
      throwHttpError(401, "Invalid or expired session");
    const result = await this.auth.restore(token, claims.exp);
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
  async logout(
    @Headers("authorization") authorization: string | undefined,
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const browser = request.headers["x-auth-client"] === "web";
    if (browser || readCookie(request, REFRESH_COOKIE))
      assertBrowserRequest(request);
    const bearer = getBearerToken(authorization);
    const result = await this.auth.logout(
      bearer && this.jwt.verify(bearer) ? bearer : null,
      browser ? readCookie(request, REFRESH_COOKIE) : dto.refresh_token,
    );
    if (browser) clearSessionCookies(request, response);
    return result;
  }
}
