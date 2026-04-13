import { buildApp } from "./app.js";
import { env } from "./env.js";
import { createWorker, itineraryDetailQueue, OVERVIEW_QUEUE_NAME, DETAIL_QUEUE_NAME } from "./lib/queue.js";
import { processOverview } from "./workers/overview.worker.js";
import { processDetail } from "./workers/detail.worker.js";
import { redis } from "./db/redis.js";
import { closeDb } from "./db/mongodb.js";

async function main() {
  const app = await buildApp();

  // ─── Start BullMQ workers ─────────────────────────────────────────────────

  const overviewWorker = createWorker(OVERVIEW_QUEUE_NAME, async (job) => {
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

  const detailWorker = createWorker(DETAIL_QUEUE_NAME, processDetail);

  overviewWorker.on("failed", (job, err) => {
    console.error(`Overview job ${job?.id} failed:`, err.message);
  });

  detailWorker.on("failed", (job, err) => {
    console.error(`Detail job ${job?.id} failed:`, err.message);
  });

  // ─── Graceful shutdown ────────────────────────────────────────────────────

  const shutdown = async () => {
    console.info("Shutting down...");
    await overviewWorker.close();
    await detailWorker.close();
    await redis.quit();
    await closeDb();
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());

  // ─── Start server ─────────────────────────────────────────────────────────

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  console.info(`API server running on port ${env.PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
