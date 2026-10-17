import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppConfigService } from "../../../config/app-config.service.js";
import { SUPABASE_CLIENT } from "../../../database/database.tokens.js";
import { PasswordRecoveryRepository } from "../infrastructure/password-recovery.repository.js";
import { RecoveryMailer } from "../infrastructure/recovery-mailer.js";

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(PasswordRecoveryRepository)
    private readonly repository: PasswordRecoveryRepository,
    @Inject(RecoveryMailer) private readonly mailer: RecoveryMailer,
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient | null,
  ) {}

  async request(email: string) {
    this.mailer.assertConfigured();
    const settings = this.config.passwordRecovery;
    if (settings.provider === "supabase" && !this.supabase)
      throw new ServiceUnavailableException(
        "Authentication service unavailable",
      );
    let token: string | null = null;
    try {
      if (settings.provider === "local") {
        token = await this.repository.issue(email);
      } else {
        const { data, error } = await this.supabase!.auth.admin.generateLink({
          type: "recovery",
          email,
        });
        if (error) throw error;
        token = data.properties.hashed_token;
      }
      if (token) {
        const url = new URL(settings.resetUrl);
        // Fragments do not reach server access logs or referrer headers.
        url.hash = new URLSearchParams({ recovery_token: token }).toString();
        await this.mailer.send(email, url.toString());
      }
    } catch {
      if (token && settings.provider === "local")
        await this.repository.discard(token).catch(() => undefined);
      // Never include the email, token, or SMTP error payload in logs/responses.
      this.logger.error("Password recovery request could not be delivered");
    }
    // Identical response for missing accounts, throttled accounts and delivery failures.
    return {
      ok: true,
      message:
        "If an account exists for this email, a password reset link will be sent.",
    };
  }

  async reset(token: string, password: string) {
    if (this.config.passwordRecovery.provider === "local") {
      if (!(await this.repository.reset(token, password)))
        throw new BadRequestException(
          "Reset link is invalid or expired. Request a new link.",
        );
    } else {
      const config = this.config.supabaseApiConfig;
      if (!config)
        throw new ServiceUnavailableException(
          "Authentication service unavailable",
        );
      // Each recovery gets its own client: never put a user session on the shared admin client.
      const client = createClient(config.url, config.serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      const verified = await client.auth.verifyOtp({
        token_hash: token,
        type: "recovery",
      });
      if (verified.error || !verified.data.session)
        throw new BadRequestException(
          "Reset link is invalid or expired. Request a new link.",
        );
      try {
        const updated = await client.auth.updateUser({ password });
        if (updated.error)
          throw new BadRequestException(
            "Password could not be updated. Request a new link and try again.",
          );
      } finally {
        const signedOut = await client.auth.signOut({ scope: "global" });
        if (signedOut.error)
          this.logger.error("Password recovery session revocation failed");
      }
    }
    return { ok: true };
  }
}
