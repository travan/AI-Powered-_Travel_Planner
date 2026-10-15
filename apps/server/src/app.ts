import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { AppModule } from "./app.module.js";
import { AppConfigService } from "./config/app-config.service.js";

export async function buildApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(AppConfigService);
  app.set("trust proxy", config.trustProxyHops);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    })
  );

  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({
    origin: (origin: string | undefined, cb: (error: Error | null, allow: boolean) => void) => {
      if (!origin || config.allowedOrigins.has(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("Origin not allowed"), false);
    },
    credentials: true,
  });
  app.use("/api/auth/forgot-password", rateLimit({ max: 5, windowMs: 15 * 60_000 }));
  app.use("/api/auth/reset-password", rateLimit({ max: 20, windowMs: 15 * 60_000 }));
  app.use(
    rateLimit({
      max: config.rateLimit.max,
      windowMs: config.rateLimit.windowMs,
    })
  );

  return app;
}
