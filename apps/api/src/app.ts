import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import jwt from "@fastify/jwt";
import { env } from "./env.js";
import { redis } from "./db/redis.js";
import { generateRoutes } from "./routes/itinerary/generate.js";
import { streamRoutes } from "./routes/itinerary/stream.js";
import { getItineraryRoutes } from "./routes/itinerary/get.js";
import { citiesRoutes } from "./routes/cities.js";
import { usersRoutes } from "./routes/users.js";

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "production" ? "warn" : "info" },
  });

  const allowedOrigins = new Set<string>([
    env.NEXT_PUBLIC_APP_URL,
    ...env.CORS_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  ]);

  // ─── Plugins ────────────────────────────────────────────────────────────────

  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.has(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("Origin not allowed"), false);
    },
    credentials: true,
  });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis,
    keyGenerator: (request) =>
      (request.headers["x-forwarded-for"] as string) ?? request.ip,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
  });

  // ─── Auth decorator ────────────────────────────────────────────────────────

  app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ statusCode: 401, error: "Unauthorized", message: "Invalid or missing token" });
    }
  });

  // Expose redis on app instance for stream route
  app.decorate("redis", redis);

  // ─── Health check ──────────────────────────────────────────────────────────

  app.get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // ─── Routes ───────────────────────────────────────────────────────────────

  await app.register(
    async (api) => {
      await generateRoutes(api);
      await streamRoutes(api);
      await getItineraryRoutes(api);
      await citiesRoutes(api);
      await usersRoutes(api);
    },
    { prefix: "/api" }
  );

  return app;
}
