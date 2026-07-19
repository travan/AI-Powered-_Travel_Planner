import { Module } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyRequest } from "fastify";
import { NestFactory } from "@nestjs/core";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { env } from "./env.js";
import { redis } from "./db/redis.js";
import { HealthController } from "./health.controller.js";
import { AuthController } from "./modules/auth/interfaces/http/auth.controller.js";
import { BillsController } from "./modules/bills/interfaces/http/bills.controller.js";
import { CitiesController } from "./modules/cities/interfaces/http/cities.controller.js";
import { ItineraryController } from "./modules/itinerary/interfaces/http/itinerary.controller.js";
import { RecommendationsController } from "./modules/recommendations/interfaces/http/recommendations.controller.js";
import { SearchDraftsController } from "./modules/search-drafts/interfaces/http/search-drafts.controller.js";
import { TripsController } from "./modules/trips/interfaces/http/trips.controller.js";
import { UsersController } from "./modules/users/interfaces/http/users.controller.js";

@Module({
  controllers: [
    HealthController,
    AuthController,
    SearchDraftsController,
    TripsController,
    BillsController,
    RecommendationsController,
    ItineraryController,
    CitiesController,
    UsersController,
  ],
})
export class ApiAppModule {}

export async function buildApp(): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({
    logger: { level: env.NODE_ENV === "production" ? "warn" : "info" },
  });
  const app = await NestFactory.create<NestFastifyApplication>(ApiAppModule, adapter, {
    bufferLogs: true,
  });

  const allowedOrigins = new Set<string>([
    env.NEXT_PUBLIC_APP_URL,
    ...env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  ]);

  await app.register(helmet as never, { contentSecurityPolicy: false });
  await app.register(cors as never, {
    origin: (origin: string | undefined, cb: (error: Error | null, allow: boolean) => void) => {
      if (!origin || allowedOrigins.has(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("Origin not allowed"), false);
    },
    credentials: true,
  });
  await app.register(rateLimit as never, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis,
    keyGenerator: (request: FastifyRequest) =>
      (request.headers["x-forwarded-for"] as string) ?? request.ip,
  });

  return app;
}
