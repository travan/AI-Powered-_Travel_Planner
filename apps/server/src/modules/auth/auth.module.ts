import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { SharedAuthModule } from "../../shared/nest/shared-auth.module.js";
import { AuthService } from "./application/auth.service.js";
import { USER_REPOSITORY } from "./domain/user.repository.js";
import { PostgresUserRepository } from "./infrastructure/postgres-user.repository.js";
import { AuthController } from "./interfaces/http/auth.controller.js";

@Module({
  imports: [DatabaseModule, SharedAuthModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: USER_REPOSITORY,
      useClass: PostgresUserRepository,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
