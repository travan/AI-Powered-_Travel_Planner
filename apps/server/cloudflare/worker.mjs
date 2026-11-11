import "reflect-metadata";
import pg from "pg";
import { httpServerHandler } from "cloudflare:node";
import { buildApp } from "../dist/app.js";
import { workerRequestContext } from "../dist/cloudflare/request-context.js";
import { JourneyService } from "../dist/modules/itinerary/journey/journey.service.js";
import { FeedbackMailWorker } from "../dist/modules/itinerary/learning/feedback-mail.worker.js";
import { CityCatalogWorker } from "../dist/modules/cities/application/city-catalog.worker.js";

import { withWorkerLogs, logEvent } from "../dist/observability/logger.js";

let ready;
function application() {
  ready ??= (async () => {
    const app = await buildApp();
    await app.listen(8080);
    return { app, handler: httpServerHandler({ port: 8080 }) };
  })().catch((error) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

async function inRequest(env, ctx, work) {
  const pool = new pg.Pool({
    // Hyperdrive verifies the origin certificate using the uploaded Supabase CA.
    connectionString: env.HYPERDRIVE.connectionString,
    max: 2,
    connectionTimeoutMillis: 10000,
    query_timeout: 15000,
    idleTimeoutMillis: 1000,
  });
  try {
    return await workerRequestContext.run({ pool, ai: env.AI }, work);
  } finally {
    ctx.waitUntil(pool.end());
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const clientIp = request.headers.get("CF-Connecting-IP");
    if (clientIp && env.PUBLIC_API_LIMIT && /^\/api\/(cities|locations)\//.test(url.pathname)) {
      const { success } = await env.PUBLIC_API_LIMIT.limit({ key: clientIp });
      if (!success)
        return Response.json({ code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "60" } });
    }
    return withWorkerLogs((task) => ctx.waitUntil(task), () => inRequest(env, ctx, async () => {
      const { handler } = await application();
      const response = await handler.fetch(request, env, ctx);
      if (response.status >= 500) logEvent("http.failed", "error", { code: `HTTP_${response.status}` });
      return response;
    }));
  },
  async queue(batch, env, ctx) {
    return withWorkerLogs((task) => ctx.waitUntil(task), () => inRequest(env, ctx, async () => {
      const { app } = await application();
      const journey = app.get(JourneyService);
      for (const message of batch.messages) {
        const id = message.body?.jobId;
        if (typeof id === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
          await journey.processNextJob(id);
        message.ack();
      }
    }));
  },
  async scheduled(_event, env, ctx) {
    return withWorkerLogs((task) => ctx.waitUntil(task), () => inRequest(env, ctx, async () => {
      const { app } = await application();
      const journey = app.get(JourneyService);
      if (env.JOURNEY_QUEUE) {
        await journey.expireJobs();
        for (let batch = 0; batch < 15; batch++) {
          const due = await journey.reserveDispatch(100);
          if (!due.length) break;
          await env.JOURNEY_QUEUE.sendBatch(due.map(({ job_id }) => ({ body: { jobId: job_id } })));
        }
      } else {
        await journey.processNextJob();
      }
      await Promise.all([app.get(FeedbackMailWorker).processNext(), app.get(CityCatalogWorker).processNextJob()]);
    }), true);
  },
};
