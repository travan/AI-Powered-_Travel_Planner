import nodemailer from "nodemailer";
import type { AppConfigService } from "../../config/app-config.service.js";

export function createSmtpTransport(config: AppConfigService) {
  const settings = config.smtp;
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    requireTLS: config.nodeEnv === "production" && !settings.smtpSecure,
    auth: settings.smtpUser
      ? { user: settings.smtpUser, pass: settings.smtpPassword }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}
