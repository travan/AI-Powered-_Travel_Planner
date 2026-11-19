import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { parseFallbackSources } from "../../../packages/ai/fallback-config.mjs";

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
  process.env.JOURNEY_QUEUE_CONCURRENCY ?? (target === "staging" ? 4 : 1),
);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 250)
  throw new Error(
    "Set JOURNEY_QUEUE_CONCURRENCY to the measured concurrency limit.",
  );
const percent = Number(
  process.env.PLANNING_V2_PERCENT || 100,
);
const aiConcurrency = Number(
  process.env.PLANNING_AI_CONCURRENCY || concurrency,
);
if (
  !Number.isInteger(percent) ||
  percent < 0 ||
  percent > 100 ||
  ![1, 2, 4, 8, 16].includes(aiConcurrency)
)
  throw new Error(
    "Use a valid rollout percentage and measured AI concurrency (1,2,4,8,16)",
  );
config.vars.PLANNING_V2_PERCENT = String(percent);
config.vars.PLANNING_AI_CONCURRENCY = String(aiConcurrency);
config.vars.PLANNING_CANARY_USER_IDS =
  process.env.PLANNING_CANARY_USER_IDS ?? "";
const provider =
  target === "staging"
    ? (process.env.STAGING_AI_PROVIDER ?? "mock")
    : (process.env.DEPLOY_AI_PROVIDER ??
      config.vars.AI_PROVIDER ??
      "cloudflare");
if (
  ![
    "cloudflare",
    "claude",
    "openai",
    "gemini",
    ...(target === "staging" ? ["mock"] : []),
  ].includes(provider)
)
  throw new Error("Unsupported deployment AI provider");
config.vars.AI_PROVIDER = provider;
const fallback = target === "production" ? (process.env.DEPLOY_AI_FALLBACK_PROVIDERS ?? "") : "";
const maxFallbacks = Number(process.env.DEPLOY_AI_FALLBACK_MAX_SOURCES ?? 5);
parseFallbackSources(fallback, maxFallbacks);
config.vars.AI_FALLBACK_PROVIDERS = fallback;
config.vars.AI_FALLBACK_MAX_SOURCES = String(maxFallbacks);
config.vars.AI_FALLBACK_CANARY_ONLY = process.env.DEPLOY_AI_FALLBACK_CANARY_ONLY === "false" ? "false" : "true";
for (const key of [
  "CLOUDFLARE_AI_MODEL",
  "ANTHROPIC_MODEL",
  "OPENAI_MODEL",
  "GEMINI_MODEL",
])
  if (process.env[key]?.trim()) config.vars[key] = process.env[key].trim();
const modelKey = {
  claude: "ANTHROPIC_MODEL",
  openai: "OPENAI_MODEL",
  gemini: "GEMINI_MODEL",
}[provider];
if (modelKey && !config.vars[modelKey])
  throw new Error(`Set ${modelKey} for the selected provider`);

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
    AI_PROVIDER: process.env.STAGING_AI_PROVIDER ?? "mock",
    JOURNEY_STAGING_DELAY_MS:
      process.env.STAGING_AI_PROVIDER &&
      process.env.STAGING_AI_PROVIDER !== "mock"
        ? "0"
        : "30000",
    PLANNING_STAGING: "true",
    NEXT_PUBLIC_APP_URL: origin.origin,
    CORS_ORIGINS: origin.origin,
    GOOGLE_AUTH_ENABLED: "false",
    RATE_LIMIT_MAX: "120000",
  });
  delete config.vars.GOOGLE_REDIRECT_URI;
  if (config.vars.AI_PROVIDER === "mock") delete config.ai;
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
// Nest's fallback is shared by proxy IP. The distributed bindings below apply
// route-specific ceilings before opening a database connection.
config.ratelimits = [
  { name: "PUBLIC_API_LIMIT", simple: { limit: 3000, period: 60 } },
  { name: "JOURNEY_ADMISSION_LIMIT", simple: { limit: 3000, period: 60 } },
  { name: "JOURNEY_READ_LIMIT", simple: { limit: 12000, period: 60 } },
].map((binding, index) => ({
  ...binding,
  namespace_id: String((target === "staging" ? 5100 : 5200) + index),
}));

const output = path.resolve("apps/server/wrangler.generated.json");
await fs.writeFile(output, JSON.stringify(config, null, 2) + "\n");
console.log(output);
