import { Global, Module } from "@nestjs/common";
import { AppConfigModule } from "../../config/config.module.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { LocalJwtService } from "./local-jwt.js";

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [LocalJwtService, JwtAuthGuard],
  exports: [LocalJwtService, JwtAuthGuard],
})
export class SharedAuthModule {}
