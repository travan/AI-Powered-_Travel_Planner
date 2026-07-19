import "reflect-metadata";
import { buildApp } from "./app.js";
import path from "node:path";
import { existsSync } from "node:fs";
import next from "next";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { AppConfigService } from "./config/app-config.service.js";

type NextFactory = (options: { dev: boolean; dir: string }) => {
  prepare(): Promise<void>;
  getRequestHandler(): (req: unknown, res: unknown) => Promise<void>;
};

async function registerWebHandler(app: NestExpressApplication) {
  const config = app.get(AppConfigService);
  if (!config.serveWeb) return;

  const webAppDir = path.resolve(process.cwd(), config.webAppDir);
  if (!existsSync(webAppDir)) {
    throw new Error(`WEB_APP_DIR does not exist: ${webAppDir}`);
  }

  const nextFactory = next as unknown as NextFactory;
  const nextApp = nextFactory({
    dev: config.nodeEnv !== "production",
    dir: webAppDir,
  });

  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.use(async (request: Request, response: Response, nextFn: NextFunction) => {
    if (request.path.startsWith("/api") || request.path === "/health") {
      nextFn();
      return;
    }
    await handle(request, response);
  });

  console.info({ webAppDir }, "Next.js handler attached to Nest API server");
}

async function main() {
  const app = await buildApp();
  const config = app.get(AppConfigService);
  await registerWebHandler(app);

  const shutdown = async () => {
    console.info("Shutting down...");
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  await app.listen(config.port, "0.0.0.0");
  if (config.serveWeb) {
    console.info(`Unified Nest server (API + Web) running on port ${config.port}`);
  } else {
    console.info(`Nest API server running on port ${config.port}`);
  }
}

main().catch((err) => {
  console.error("Failed to start Nest API server:", err);
  process.exit(1);
});
