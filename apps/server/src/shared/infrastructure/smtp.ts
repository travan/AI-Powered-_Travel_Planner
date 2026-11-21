import nodemailer from "nodemailer";
import type { AppConfigService } from "../../config/app-config.service.js";

/** Persist only fixed diagnostic labels, never SMTP responses or credentials. */
export function smtpFailureCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  switch (code) {
    case "EAUTH": case "ENOAUTH": case "EOAUTH2": return "SMTP_AUTH_FAILED";
    case "EDNS": return "SMTP_DNS_FAILED";
    case "ETLS": case "EPROTO": return "SMTP_TLS_FAILED";
    case "ETIMEDOUT": return "SMTP_TIMEOUT";
    case "ECONNECTION": case "ESOCKET": case "ECONNREFUSED": case "ECONNRESET": return "SMTP_CONNECTION_FAILED";
    case "EENVELOPE": return "SMTP_RECIPIENT_REJECTED";
    default: return "SMTP_DELIVERY_FAILED";
  }
}

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
