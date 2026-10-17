import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import nodemailer from "nodemailer";
import { AppConfigService } from "../../../config/app-config.service.js";

@Injectable()
export class RecoveryMailer {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  assertConfigured() {
    const settings = this.config.passwordRecovery;
    if (!settings.smtpHost || !settings.from) {
      throw new ServiceUnavailableException(
        "Password recovery email is not configured. Please contact support.",
      );
    }
  }

  async send(email: string, url: string) {
    this.assertConfigured();
    const settings = this.config.passwordRecovery;
    const transport = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpSecure,
      requireTLS: this.config.nodeEnv === "production" && !settings.smtpSecure,
      auth: settings.smtpUser
        ? { user: settings.smtpUser, pass: settings.smtpPassword }
        : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await transport.sendMail({
      from: settings.from,
      to: email,
      subject: "Reset your Horizon password",
      text: `Use this link to reset your password:\n\n${url}\n\nThis link can be used once and expires shortly. If you did not request it, ignore this email.`,
    });
  }
}
