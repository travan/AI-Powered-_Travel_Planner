import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { AppConfigService } from "../../../config/app-config.service.js";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import { createSmtpTransport } from "../../../shared/infrastructure/smtp.js";

const RECIPIENT = "travan.it.96@gmail.com";

type PendingMail = {
  id: string;
  claim_token: string;
  rating: number;
  note: string;
  route: string;
};

@Injectable()
export class FeedbackMailWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedbackMailWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    @Inject(SQL_CLIENT) private readonly sql: SqlClient,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  onModuleInit() {
    if (process.env.RUNTIME_TARGET === "cloudflare") return;
    this.timer = setInterval(() => {
      void this.processNext();
    }, 2000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processNext() {
    if (this.running) return;
    this.running = true;
    try {
      const smtp = this.config.smtp;
      if (!smtp.smtpHost || !smtp.from) return;
      const {
        rows: [mail],
      } = await this.sql.query<PendingMail>(
        `with candidate as (
           select id from planner_feedback_mail
           where sent_at is null and next_attempt_at <= now()
           order by next_attempt_at,id limit 1 for update skip locked
         )
         update planner_feedback_mail m
         set claim_token=gen_random_uuid(), next_attempt_at=now()+interval '5 minutes',
             attempts=attempts+1
         from candidate where m.id=candidate.id
         returning m.id,m.claim_token,m.rating,m.note,m.route`,
      );
      if (!mail) return;
      try {
        await createSmtpTransport(this.config).sendMail({
          from: smtp.from,
          to: RECIPIENT,
          messageId: `<planner-feedback-${mail.id}@horizon.travel>`,
          subject: `Horizon Planner Feedback${mail.rating <= 3 ? " Priority" : ""} - ${mail.rating}/5`,
          text: [
            `Mã phản hồi / Feedback ID: ${mail.id}`,
            `Điểm / Rating: ${mail.rating}/5`,
            `Tuyến / Route: ${mail.route || "—"}`,
            "",
            mail.note,
          ].join("\n"),
        });
      } catch {
        await this.sql.query(
          `update planner_feedback_mail
           set claim_token=null, next_attempt_at=now()+make_interval(mins => least(360, 1 << least(attempts-1, 9)))
           where id=$1 and claim_token=$2`,
          [mail.id, mail.claim_token],
        );
        this.logger.warn(
          "Planner feedback SMTP delivery failed; retry scheduled",
        );
        return;
      }
      await this.sql.query(
        `update planner_feedback_mail set sent_at=now(),claim_token=null,note='',route=''
         where id=$1 and claim_token=$2`,
        [mail.id, mail.claim_token],
      );
    } catch {
      this.logger.error("Planner feedback mail queue processing failed");
    } finally {
      this.running = false;
    }
  }
}
