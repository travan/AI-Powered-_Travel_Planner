import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const target = process.argv[2];
if (!["staging", "production"].includes(target))
  throw new Error(
    "Usage: node apps/server/cloudflare/prepare-queue-config.mjs staging|production",
  );

const base = new URL("../wrangler.jsonc", import.meta.url);
const { config, error } = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  await fs.readFile(base, "utf8"),
);
if (error) throw new Error("Invalid Wrangler configuration.");

const queue = `travel-planner-journey-${target}`;
const concurrency = Number(
  process.env.JOURNEY_QUEUE_CONCURRENCY ?? (target === "staging" ? 20 : 0),
);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 250)
  throw new Error(
    "Set JOURNEY_QUEUE_CONCURRENCY to the measured concurrency limit.",
  );

if (target === "staging") {
  const database = process.env.STAGING_HYPERDRIVE_ID;
  const origin = new URL(process.env.STAGING_WEB_ORIGIN ?? "");
  if (
    !/^[0-9a-f]{32}$/.test(database ?? "") ||
    database === config.hyperdrive[0].id
  )
    throw new Error("Use a dedicated staging Hyperdrive binding.");
  if (
    origin.protocol !== "https:" ||
    origin.origin === config.vars.NEXT_PUBLIC_APP_URL
  )
    throw new Error("Use a dedicated HTTPS staging web origin.");
  config.name = "travel-planner-api-staging";
  config.hyperdrive[0].id = database;
  Object.assign(config.vars, {
    AI_PROVIDER: "mock",
    JOURNEY_STAGING_DELAY_MS: "30000",
    NEXT_PUBLIC_APP_URL: origin.origin,
    CORS_ORIGINS: origin.origin,
    GOOGLE_AUTH_ENABLED: "false",
    RATE_LIMIT_MAX: "120000",
  });
  delete config.vars.GOOGLE_REDIRECT_URI;
  delete config.ai;
}

config.queues = {
  producers: [{ binding: "JOURNEY_QUEUE", queue }],
  consumers: [
    {
      queue,
      max_batch_size: 1,
      max_batch_timeout: 1,
      max_concurrency: concurrency,
      max_retries: 3,
      dead_letter_queue: `${queue}-dead`,
    },
  ],
};
config.ratelimits = [
  {
    name: "PUBLIC_API_LIMIT",
    namespace_id: target === "staging" ? "5002" : "5001",
    simple: { limit: target === "staging" ? 120000 : 3000, period: 60 },
  },
];

const output = path.resolve("apps/server/wrangler.generated.json");
await fs.writeFile(output, JSON.stringify(config, null, 2) + "\n");
console.log(output);
