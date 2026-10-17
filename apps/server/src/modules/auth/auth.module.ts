import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { SharedAuthModule } from "../../shared/nest/shared-auth.module.js";
import { AuthService } from "./application/auth.service.js";
import { USER_REPOSITORY } from "./domain/user.repository.js";
import { PostgresUserRepository } from "./infrastructure/postgres-user.repository.js";
import { AuthController } from "./interfaces/http/auth.controller.js";

import { PasswordRecoveryService } from "./application/password-recovery.service.js";
import { PasswordRecoveryRepository } from "./infrastructure/password-recovery.repository.js";
import { RecoveryMailer } from "./infrastructure/recovery-mailer.js";

@Module({
  imports: [DatabaseModule, SharedAuthModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordRecoveryService,
    PasswordRecoveryRepository,
    RecoveryMailer,
    {
      provide: USER_REPOSITORY,
      useClass: PostgresUserRepository,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
