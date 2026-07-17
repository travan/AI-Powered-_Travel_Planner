import { buildApp } from "./app.js";
import { env } from "./env.js";
import {
  createWorker,
  itineraryDetailQueue,
  type ItineraryJobData,
  type PromptAnalysisJobData,
  OVERVIEW_QUEUE_NAME,
  DETAIL_QUEUE_NAME,
  PROMPT_ANALYSIS_QUEUE_NAME,
} from "./lib/queue.js";
import { processOverview } from "./workers/overview.worker.js";
import { processDetail } from "./workers/detail.worker.js";
import { processPromptAnalysis } from "./workers/prompt-analysis.worker.js";
import { redis } from "./db/redis.js";
import { closeDb } from "./db/mongodb.js";
import { closePostgres } from "./db/postgres.js";
import path from "node:path";
import { existsSync } from "node:fs";
import next from "next";

async function registerWebHandler(app: Awaited<ReturnType<typeof buildApp>>) {
  if (!env.SERVE_WEB) return;

  const webAppDir = path.resolve(process.cwd(), env.WEB_APP_DIR);
  if (!existsSync(webAppDir)) {
    throw new Error(`WEB_APP_DIR does not exist: ${webAppDir}`);
  }

  const nextApp = next({
    dev: env.NODE_ENV !== "production",
    dir: webAppDir,
  });

  await nextApp.prepare();
  const handle = nextApp.getRequestHandler();

  app.all("/*", async (request, reply) => {
    await handle(request.raw, reply.raw);
    reply.hijack();
  });

  app.log.info({ webAppDir }, "Next.js handler attached to API server");
}

async function main() {
  const app = await buildApp();
  await registerWebHandler(app);

  // ─── Start BullMQ workers ─────────────────────────────────────────────────

  const overviewWorker = createWorker<ItineraryJobData>(OVERVIEW_QUEUE_NAME, async (job) => {
    await processOverview(job);
    // After overview, immediately enqueue detail job
    const normalizedData = {
      ...job.data,
      jobId: job.data.jobId && job.data.jobId.length > 0 ? job.data.jobId : String(job.id),
    };

    // Store overview for detail worker
    const overviewRaw = await redis.get(`job:overview:${normalizedData.jobId}`);
    if (!overviewRaw) {
      // Overview was published via SSE; re-read from the last published event
      // In production, the overview worker stores it explicitly
    }
    await itineraryDetailQueue.add("detail", normalizedData, { jobId: `detail-${normalizedData.jobId}` });
  });

  const detailWorker = createWorker<ItineraryJobData>(DETAIL_QUEUE_NAME, processDetail);
  const promptAnalysisWorker = createWorker<PromptAnalysisJobData>(PROMPT_ANALYSIS_QUEUE_NAME, processPromptAnalysis);

  overviewWorker.on("failed", (job, err) => {
    console.error(`Overview job ${job?.id} failed:`, err.message);
  });

  detailWorker.on("failed", (job, err) => {
    console.error(`Detail job ${job?.id} failed:`, err.message);
  });

  promptAnalysisWorker.on("failed", (job, err) => {
    console.error(`Prompt analysis job ${job?.id} failed:`, err.message);
  });

  // ─── Graceful shutdown ────────────────────────────────────────────────────

  const shutdown = async () => {
    console.info("Shutting down...");
    await overviewWorker.close();
    await detailWorker.close();
    await promptAnalysisWorker.close();
    await redis.quit();
    await closeDb();
    await closePostgres();
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  // ─── Start server ─────────────────────────────────────────────────────────

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  if (env.SERVE_WEB) {
    console.info(`Unified server (API + Web) running on port ${env.PORT}`);
  } else {
    console.info(`API server running on port ${env.PORT}`);
  }
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
