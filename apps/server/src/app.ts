import { randomUUID } from "node:crypto";
import { SafeNestLogger, logContext, logEvent, flushLogs } from "./observability/logger.js";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { AppModule } from "./app.module.js";
import { AppConfigService } from "./config/app-config.service.js";
import { workerRequestContext } from "./cloudflare/request-context.js";
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
    scope.queryCount = 0;
    logContext.run(scope, () => {
      if (req.get("Authorization")) res.setHeader("Cache-Control", "private, no-store");
      if (scope.fields.requestId) res.setHeader("X-Request-Id", scope.fields.requestId);
      res.once("finish", () => logContext.run(scope, () => {
        const route = typeof req.route?.path === "string" ? req.route.path : "unmatched";
        const metrics = { route, status: res.statusCode, durationMs: Date.now() - started, dbQueries: scope.queryCount };
        if (res.statusCode >= 500) logEvent("http.failed", "error", { ...metrics, code: `HTTP_${res.statusCode}` });
        else if (res.statusCode === 429 || Math.random() < 0.02)
          logEvent("http.request", "info", metrics);
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
    exposedHeaders: ["Retry-After", "X-Request-Id"],
  });
  app.use("/api/auth/google/start", rateLimit({ max: 10, windowMs: 15 * 60_000 }));
  app.use("/api/auth/forgot-password", rateLimit({ max: 5, windowMs: 15 * 60_000 }));
  app.use("/api/auth/reset-password", rateLimit({ max: 20, windowMs: 15 * 60_000 }));
  const loadTest = process.env.AI_PROVIDER === "mock" && process.env.JOURNEY_STAGING_DELAY_MS === "30000";
  app.use("/api/auth/refresh", rateLimit({ max: loadTest ? 5000 : 120, windowMs: 15 * 60_000 }));
  app.use(
    rateLimit({
      max: config.rateLimit.max,
      windowMs: config.rateLimit.windowMs,
      skip: () => workerRequestContext.getStore()?.rateLimitedAtEdge === true,
    })
  );

  return app;
}
