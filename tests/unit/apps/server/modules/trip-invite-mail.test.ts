import { expect, it, vi } from "vitest";
import { TripInviteMailWorker } from "../../../../../apps/server/src/modules/trips/application/trip-invite-mail.worker";

it("does not consume delivery attempts while authenticated SMTP is missing its password", async () => {
  const query = vi.fn(async () => ({ rows: [{ status: "pending", attempts: 0, sent_at: null }] }));
  const smtp = { smtpHost: "smtp.gmail.com", from: "sender@test.invalid", smtpUser: "sender@test.invalid", smtpPassword: "" };
  const worker = new TripInviteMailWorker({ query } as never, { smtp } as never);
  expect(worker.configured()).toBe(false);
  await worker.processNext();
  expect(query).not.toHaveBeenCalled();
  expect(await worker.status("invite")).toEqual({ emailStatus: "not_configured" });
  smtp.smtpPassword = "test-only";
  expect(worker.configured()).toBe(true);
});
