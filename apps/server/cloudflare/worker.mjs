import "reflect-metadata";
import pg from "pg";
import { httpServerHandler } from "cloudflare:node";
import { buildApp } from "../dist/app.js";
import { workerRequestContext } from "../dist/cloudflare/request-context.js";
import { CityCatalogWorker } from "../dist/modules/cities/application/city-catalog.worker.js";

let ready;
function application() {
  ready ??= (async () => {
    const app = await buildApp();
    await app.listen(8080);
    return { app, handler: httpServerHandler({ port: 8080 }) };
  })().catch(error => { ready = undefined; throw error; });
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
    return inRequest(env, ctx, async () => {
      const { handler } = await application();
      return handler.fetch(request, env, ctx);
    });
  },
  async scheduled(_event, env, ctx) {
    return inRequest(env, ctx, async () => {
      const { app } = await application();
      await app.get(CityCatalogWorker).processNextJob();
    });
  },
};
