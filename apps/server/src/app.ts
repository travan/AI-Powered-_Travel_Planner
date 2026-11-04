import { randomUUID } from "node:crypto";
import { SafeNestLogger, logContext, logEvent, flushLogs } from "./observability/logger.js";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { AppModule } from "./app.module.js";
import { AppConfigService } from "./config/app-config.service.js";
import { isAllowedCorsOrigin } from "./cors-origin.js";

export async function buildApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: process.env.NODE_ENV === "production" ? new SafeNestLogger() : undefined,
  });
  const config = app.get(AppConfigService);
  app.set("trust proxy", config.trustProxyHops);

  app.use((req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    const scope = logContext.getStore() ?? { records: [], fields: { requestId: randomUUID() } };
    const started = Date.now();
    logContext.run(scope, () => {
      res.once("finish", () => logContext.run(scope, () => {
        if (res.statusCode >= 500) logEvent("http.failed", "error", { code: `HTTP_${res.statusCode}`, durationMs: Date.now() - started });
        if (process.env.RUNTIME_TARGET !== "cloudflare") void flushLogs(scope.records.splice(0));
      }));
      next();
    });
  });

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
      if (isAllowedCorsOrigin(origin, config.allowedOrigins, config.allowQuickTunnelOrigins)) {
        cb(null, true);
        return;
      }
      cb(new Error("Origin not allowed"), false);
    },
    credentials: true,
  });
  app.use("/api/auth/google/start", rateLimit({ max: 10, windowMs: 15 * 60_000 }));
  app.use("/api/auth/forgot-password", rateLimit({ max: 5, windowMs: 15 * 60_000 }));
  app.use("/api/auth/reset-password", rateLimit({ max: 20, windowMs: 15 * 60_000 }));
  app.use("/api/auth/refresh", rateLimit({ max: 120, windowMs: 15 * 60_000 }));
  app.use(
    rateLimit({
      max: config.rateLimit.max,
      windowMs: config.rateLimit.windowMs,
    })
  );

  return app;
}
