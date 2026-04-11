import type { FastifyInstance } from "fastify";
import { itineraryQueue } from "../../lib/queue.js";
import { initSSE, sendSSEEvent, closeSSE, sendHeartbeat } from "../../lib/sse.js";

export async function streamRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { jobId: string } }>(
    "/stream/:jobId",
    async (request, reply) => {
      const { jobId } = request.params;

      initSSE(reply);

      const job = await itineraryQueue.getJob(jobId);
      if (!job) {
        sendSSEEvent(reply, "error", { message: "Job not found", code: "JOB_NOT_FOUND" });
        closeSSE(reply);
        return;
      }

      // Send current state immediately
      const state = await job.getState();
      sendSSEEvent(reply, "queued", { status: state, job_id: jobId });

      // Poll job progress via Redis pub/sub
      const channel = `itinerary:progress:${jobId}`;
      const subscriber = fastify.redis?.duplicate();

      if (!subscriber) {
        sendSSEEvent(reply, "error", { message: "Redis unavailable", code: "REDIS_ERROR" });
        closeSSE(reply);
        return;
      }

      await subscriber.subscribe(channel);

      // Heartbeat every 15s to keep connection alive
      const heartbeatInterval = setInterval(() => {
        sendHeartbeat(reply);
      }, 15_000);

      // SSE timeout: 3 minutes max
      const timeout = setTimeout(() => {
        sendSSEEvent(reply, "error", {
          message: "Generation timed out",
          code: "TIMEOUT",
        });
        cleanup();
      }, 180_000);

      subscriber.on("message", (_channel: string, message: string) => {
        const event = JSON.parse(message) as { type: string; data: unknown };
        sendSSEEvent(reply, event.type as Parameters<typeof sendSSEEvent>[1], event.data);

        if (event.type === "complete" || event.type === "error") {
          cleanup();
        }
      });

      request.raw.on("close", cleanup);

      function cleanup() {
        clearInterval(heartbeatInterval);
        clearTimeout(timeout);
        void subscriber.unsubscribe(channel);
        void subscriber.quit();
        closeSSE(reply);
      }
    }
  );
}
