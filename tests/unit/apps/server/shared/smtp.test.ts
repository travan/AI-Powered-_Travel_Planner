import { expect, it } from "vitest";
import { smtpFailureCode } from "../../../../../apps/server/src/shared/infrastructure/smtp";

it.each([
  ["EAUTH", "SMTP_AUTH_FAILED"], ["ENOAUTH", "SMTP_AUTH_FAILED"],
  ["EDNS", "SMTP_DNS_FAILED"], ["ETLS", "SMTP_TLS_FAILED"],
  ["ETIMEDOUT", "SMTP_TIMEOUT"], ["ESOCKET", "SMTP_CONNECTION_FAILED"],
  ["ECONNECTION", "SMTP_CONNECTION_FAILED"], ["EENVELOPE", "SMTP_RECIPIENT_REJECTED"],
])("classifies %s without retaining provider response or authentication data", (code, expected) => {
  expect(smtpFailureCode({ code, message: "private password", response: "private email" })).toBe(expected);
});
it.each([undefined, null, "private password", { code: "private password", response: "private email" }])(
  "never persists unrecognized error data", error => expect(smtpFailureCode(error)).toBe("SMTP_DELIVERY_FAILED"),
);
