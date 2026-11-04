import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request, Response } from "express";
import {
  GoogleAuthError,
  GoogleAuthService,
  googleConfig,
} from "../../application/google-auth.service.js";
import { AuthService } from "../../application/auth.service.js";
import { LocalJwtService } from "../../../../shared/nest/local-jwt.js";
import { ACCESS_COOKIE } from "../../domain/session.js";
import {
  assertBrowserRequest,
  readCookie,
  setSessionCookies,
} from "./session-cookies.js";
import { logEvent } from "../../../../observability/logger.js";
const BROWSER_COOKIE = "horizon_google_oauth";
class GoogleStartDto {
  @IsIn(["signin", "link"]) intent!: "signin" | "link";
  @IsOptional() @IsString() @MaxLength(2048) next?: string;
  @IsOptional() @IsString() @MaxLength(256) password?: string;
}
function cookieOptions() {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === "production" ||
      googleConfig()?.redirect.protocol === "https:",
    sameSite: "lax" as const,
    path: "/api/auth/google",
  };
}
@Controller("api/auth")
export class GoogleAuthController {
  constructor(
    @Inject(GoogleAuthService) private readonly google: GoogleAuthService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(LocalJwtService) private readonly jwt: LocalJwtService,
  ) {}
  @Get("providers")
  providers(@Res({ passthrough: true }) response: Response) {
    response.setHeader("Cache-Control", "no-store");
    return { google: Boolean(googleConfig()) };
  }
  @Get("google/status")
  async status(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader("Cache-Control", "private, no-store");
    const token = readCookie(request, ACCESS_COOKIE);
    if (!token || !this.jwt.verify(token)) throw new UnauthorizedException();
    try {
      return await this.google.accountMethods(token);
    } catch (error) {
      if (error instanceof GoogleAuthError) throw new UnauthorizedException();
      throw error;
    }
  }
  @Post("google/start")
  async start(
    @Body() dto: GoogleStartDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertBrowserRequest(request);
    response.setHeader("Cache-Control", "no-store");
    const config = googleConfig();
    if (!config)
      throw new ServiceUnavailableException({ code: "google_unavailable" });
    if (request.headers.origin !== config.redirect.origin)
      throw new ForbiddenException({ code: "google_origin_denied" });
    try {
      const started = await this.google.start(
        dto,
        readCookie(request, ACCESS_COOKIE),
      );
      response.cookie(BROWSER_COOKIE, started.browser, {
        ...cookieOptions(),
        maxAge: started.maxAge,
      });
      return { url: started.url };
    } catch (error) {
      if (error instanceof GoogleAuthError)
        throw new BadRequestException({ code: error.code });
      throw error;
    }
  }
  @Get("google/callback")
  async callback(
    @Query("state") state: string | undefined,
    @Query("code") code: string | undefined,
    @Query("error") error: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.clearCookie(BROWSER_COOKIE, cookieOptions());
    const origin = googleConfig()?.redirect.origin;
    if (!origin) return response.status(503).send("Google sign-in unavailable");
    try {
      if (
        [state, code, error].some(
          (value) => value !== undefined && typeof value !== "string",
        )
      )
        throw new GoogleAuthError("google_callback_error");
      const result = await this.google.finish({
        state,
        code,
        error,
        browser: readCookie(request, BROWSER_COOKIE),
        sessionToken: readCookie(request, ACCESS_COOKIE),
      });
      const session = await this.auth.signSession(this.jwt, result.user);
      setSessionCookies({ user: session.user, session }, request, response);
      return response.redirect(303, `${origin}${result.next}`);
    } catch (failure) {
      logEvent("oauth.failed", "warn", { code: "GOOGLE_CALLBACK_FAILED" });
      const safeCode =
        failure instanceof GoogleAuthError
          ? failure.code
          : "google_callback_error";
      return response.redirect(
        303,
        `${origin}/login?error=${encodeURIComponent(safeCode)}`,
      );
    }
  }
}
