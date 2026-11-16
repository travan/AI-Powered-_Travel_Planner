import "reflect-metadata";
import pg from "pg";
import { httpServerHandler } from "cloudflare:node";
import { buildApp } from "../dist/app.js";
import { workerRequestContext } from "../dist/cloudflare/request-context.js";
import { JourneyService } from "../dist/modules/itinerary/journey/journey.service.js";
import { FeedbackMailWorker } from "../dist/modules/itinerary/learning/feedback-mail.worker.js";
import { CityCatalogWorker } from "../dist/modules/cities/application/city-catalog.worker.js";

import { withWorkerLogs, logEvent } from "../dist/observability/logger.js";
import { withAiPermit } from "../dist/modules/itinerary/generation/ai-permit.js";
import { stagingAi } from "../dist/modules/itinerary/generation/staging-ai.js";

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

async function inRequest(env, ctx, work, rateLimitedAtEdge = false) {
  const pool = new pg.Pool({
    // Hyperdrive verifies the origin certificate using the uploaded Supabase CA.
    connectionString: env.HYPERDRIVE.connectionString,
    max: 2,
    connectionTimeoutMillis: 10000,
    query_timeout: 15000,
    idleTimeoutMillis: 1000,
  });
  try {
    const sql = {
      query: async (text, params) => ({
        rows: (await pool.query(text, params)).rows,
      }),
    };
    const rawAi =
      env.PLANNING_STAGING === "true" && env.AI_PROVIDER === "mock"
        ? stagingAi
        : env.AI;
    const ai =
      rawAi && (Number(env.PLANNING_V2_PERCENT ?? 0) > 0 || env.JOURNEY_QUEUE)
        ? {
            run: (model, input) =>
              withAiPermit(sql, () => rawAi.run(model, input)),
          }
        : rawAi;
    return await workerRequestContext.run(
      { pool, ai, rawAi, queue: env.JOURNEY_QUEUE, rateLimitedAtEdge },
      work,
    );
  } finally {
    ctx.waitUntil(pool.end());
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const clientIp = request.headers.get("CF-Connecting-IP");
    const path = url.pathname;
    const admission =
      request.method === "POST" &&
      (/^\/api\/itinerary\/(generate|jobs\/[^/]+\/retry)$/.test(path) ||
        /\/(translations|itinerary-revisions)$/.test(path));
    const statusRead =
      request.method === "GET" &&
      /^\/api\/(itinerary\/jobs\/|planning\/(requests|statuses)$|trips\/[^/]+\/workspace$|notifications(?:\/|$))/.test(
        path,
      );
    const limiter = admission
      ? env.JOURNEY_ADMISSION_LIMIT
      : statusRead
        ? env.JOURNEY_READ_LIMIT
        : /^\/api\/(cities|locations)\//.test(path)
          ? env.PUBLIC_API_LIMIT
          : undefined;
    const rateLimitedAtEdge = Boolean(
      clientIp && limiter && request.method !== "OPTIONS",
    );
    if (rateLimitedAtEdge) {
      const { success } = await limiter.limit({ key: clientIp });
      if (!success) {
        const headers = new Headers({
          "Retry-After": "60",
          "Cache-Control": "no-store",
          Vary: "Origin",
        });
        const origin = request.headers.get("Origin");
        const allowed = [
          env.NEXT_PUBLIC_APP_URL,
          ...(env.CORS_ORIGINS ?? "").split(",").map((value) => value.trim()),
        ];
        if (origin && allowed.includes(origin)) {
          headers.set("Access-Control-Allow-Origin", origin);
          headers.set("Access-Control-Allow-Credentials", "true");
          headers.set("Access-Control-Expose-Headers", "Retry-After");
        }
        return Response.json(
          { code: "RATE_LIMITED" },
          { status: 429, headers },
        );
      }
    }
    return withWorkerLogs(
      (task) => ctx.waitUntil(task),
      () =>
        inRequest(
          env,
          ctx,
          async () => {
            const { handler } = await application();
            const response = await handler.fetch(request, env, ctx);
            if (response.status >= 500)
              logEvent("http.failed", "error", {
                code: `HTTP_${response.status}`,
              });
            return response;
          },
          rateLimitedAtEdge,
        ),
    );
  },
  async queue(batch, env, ctx) {
    return withWorkerLogs(
      (task) => ctx.waitUntil(task),
      () =>
        inRequest(env, ctx, async () => {
          const { app } = await application();
          const journey = app.get(JourneyService);
          for (const message of batch.messages) {
            const id = message.body?.jobId;
            if (
              typeof id === "string" &&
              /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)
            )
              await journey.processNextJob(id);
            message.ack();
          }
        }),
    );
  },
  async scheduled(_event, env, ctx) {
    return withWorkerLogs(
      (task) => ctx.waitUntil(task),
      () =>
        inRequest(env, ctx, async () => {
          const { app } = await application();
          const journey = app.get(JourneyService);
          if (env.JOURNEY_QUEUE) {
            await journey.expireJobs();
            for (let batch = 0; batch < 15; batch++) {
              const due = await journey.reserveDispatch(100);
              if (!due.length) break;
              await env.JOURNEY_QUEUE.sendBatch(
                due.map(({ job_id }) => ({ body: { jobId: job_id } })),
              );
            }
          } else if (Number(env.PLANNING_V2_PERCENT ?? 0) === 0) {
            await journey.processNextJob();
          }
          await Promise.all([
            app.get(FeedbackMailWorker).processNext(),
            app.get(CityCatalogWorker).processNextJob(),
          ]);
        }),
      true,
    );
  },
};
