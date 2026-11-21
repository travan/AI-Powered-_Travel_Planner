import {
  Inject,
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { AppConfigService } from "../../../config/app-config.service.js";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import { createSmtpTransport, smtpFailureCode } from "../../../shared/infrastructure/smtp.js";
import { logEvent } from "../../../observability/logger.js";

import type { InviteEmailStatus } from "../domain/trip.entity.js";
type Mail = {
  invite_id: string;
  claim_token: string;
  email: string;
  token: string;
  title: string;
  role: string;
  attempts: number;
  delivery_round: number;
};

@Injectable()
export class TripInviteMailWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(
    @Inject(SQL_CLIENT) private readonly sql: SqlClient,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit() {
    if (process.env.RUNTIME_TARGET === "cloudflare") return;
    this.timer = setInterval(() => {
      void this.processNext().catch(() =>
        logEvent("trip.invite_mail_deferred", "warn", {}),
      );
    }, 2000);
    this.timer.unref?.();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  configured() {
    const smtp = this.config.smtp;
    return Boolean(smtp.smtpHost && smtp.from && (!smtp.smtpUser || smtp.smtpPassword));
  }

  async resend(inviteId: string) {
    await this.sql.query(
      `insert into trip_invite_mail(invite_id) values($1)
      on conflict(invite_id) do update set status='pending',attempts=0,
        delivery_round=trip_invite_mail.delivery_round+1,next_attempt_at=now(),sent_at=null,last_error_code=null
      where trip_invite_mail.status<>'sending'`,
      [inviteId],
    );
    await this.processNext(inviteId);
    return this.status(inviteId);
  }

  async status(
    inviteId: string,
  ): Promise<{ emailStatus: InviteEmailStatus; sentAt?: string | null }> {
    const row = (
      await this.sql.query<{
        status: string;
        attempts: number;
        sent_at: string | null;
      }>(
        "select status,attempts,sent_at::text from trip_invite_mail where invite_id=$1",
        [inviteId],
      )
    ).rows[0];
    if (!row) return { emailStatus: "not_requested" };
    if (row.status === "sent")
      return { emailStatus: "sent", sentAt: row.sent_at };
    if (row.status === "cancelled") return { emailStatus: "cancelled" };
    if (!this.configured()) return { emailStatus: "not_configured" };
    return { emailStatus: row.status === "failed" ? "failed" : "queued" };
  }

  async processNext(inviteId?: string) {
    if (this.running || !this.configured()) return;
    this.running = true;
    try {
      await this.sql
        .query(`update trip_invite_mail m set status='cancelled',claim_token=null
        where m.status<>'sent' and m.status<>'cancelled' and exists(select 1 from trip_invites i
          where i.id=m.invite_id and (i.status<>'pending' or i.expires_at<=now()))`);
      await this.sql
        .query(`update trip_invite_mail set status='failed',claim_token=null,
        last_error_code='SMTP_DELIVERY_FAILED' where status='sending' and attempts>=5 and next_attempt_at<=now()`);
      const mail = (
        await this.sql.query<Mail>(
          `with candidate as (
        select m.invite_id from trip_invite_mail m join trip_invites i on i.id=m.invite_id
        where m.status in ('pending','sending','failed') and m.attempts<5 and m.next_attempt_at<=now()
          and i.status='pending' and (i.expires_at is null or i.expires_at>now())
          and ($1::uuid is null or m.invite_id=$1)
        order by m.next_attempt_at,m.invite_id limit 1 for update of m skip locked
      ), claimed as (
        update trip_invite_mail m set status='sending',claim_token=gen_random_uuid(),
          attempts=attempts+1,next_attempt_at=now()+interval '2 minutes'
        from candidate c where m.invite_id=c.invite_id returning m.*
      ) select c.*,i.email,i.token,i.role,t.title from claimed c
        join trip_invites i on i.id=c.invite_id join trips t on t.id=i.trip_id`,
          [inviteId ?? null],
        )
      ).rows[0];
      if (!mail) return;
      try {
        const origin = (
          process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
        ).replace(/\/$/, "");
        const url = `${origin}/trips/join?token=${encodeURIComponent(mail.token)}&type=invite`;
        const result = await createSmtpTransport(this.config).sendMail({
          from: this.config.smtp.from,
          to: mail.email,
          messageId: `<trip-invite-${mail.invite_id}-${mail.delivery_round}@horizon.travel>`,
          subject: `Lời mời chuyến đi / Trip invitation: ${mail.title}`,
          text: [
            `Bạn được mời tham gia chuyến đi / You're invited to join: ${mail.title}`,
            `Vai trò / Role: ${mail.role}`,
            "",
            url,
            "",
            "Đăng nhập bằng địa chỉ email nhận lời mời để tham gia. / Sign in with this email address to accept.",
            "Nếu bạn không mong đợi lời mời này, có thể bỏ qua. / Ignore this email if you did not expect it.",
          ].join("\n"),
        });
        if (result.rejected?.length) throw new Error("Recipient rejected");
        await this.sql.query(
          `update trip_invite_mail set status='sent',sent_at=now(),claim_token=null,
          last_error_code=null where invite_id=$1 and claim_token=$2`,
          [mail.invite_id, mail.claim_token],
        );
      } catch (error) {
        const code = smtpFailureCode(error);
        await this.sql.query(
          `update trip_invite_mail set status='failed',claim_token=null,
          last_error_code=$3,next_attempt_at=now()+make_interval(mins=>least(60,1<<least(attempts-1,6)))
          where invite_id=$1 and claim_token=$2`,
          [mail.invite_id, mail.claim_token, code],
        );
        logEvent("trip.invite_mail_failed", "warn", {
          code,
        });
      }
    } finally {
      this.running = false;
    }
  }
}
