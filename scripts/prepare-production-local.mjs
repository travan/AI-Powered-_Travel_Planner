import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const database = new URL(process.env.E2E_POSTGRES_URL ?? "");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
  !/test/i.test(database.pathname)
)
  throw new Error(
    "E2E_POSTGRES_URL must identify an isolated local test database",
  );
const source = path.join(root, "apps/server/wrangler.generated.json");
const { config, error } = ts.parseConfigFileTextToJson(
  source,
  await fs.readFile(source, "utf8"),
);
if (
  error ||
  config.vars.NODE_ENV !== "production" ||
  config.vars.RUNTIME_TARGET !== "cloudflare"
)
  throw new Error(
    "Generate the production Wrangler configuration before preparing local validation",
  );
config.name = "travel-planner-local-validation";
config.main = path.join(root, "apps/server/cloudflare/worker.mjs");
config.alias = Object.fromEntries(
  Object.entries(config.alias).map(([key, value]) => [
    key,
    path.resolve(root, "apps/server", value),
  ]),
);
delete config.account_id;
delete config.build; // Validate the same already-built dist used by the production dry-run.
delete config.ai; // Replay durable AI responses; never invoke remote/paid inference in local validation.
config.hyperdrive = [
  {
    binding: "HYPERDRIVE",
    id: "00000000000000000000000000000000",
    localConnectionString: database.href,
  },
];
config.queues.producers[0].queue = "travel-planner-validation";
config.queues.consumers[0].queue = "travel-planner-validation";
config.queues.consumers[0].dead_letter_queue = "travel-planner-validation-dead";
Object.assign(config.vars, {
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3352",
  CORS_ORIGINS: "http://127.0.0.1:3352,http://127.0.0.1:8787",
  JWT_SECRET: "local-production-validation-only-at-least-32-characters",
  GOOGLE_AUTH_ENABLED: "false", // OAuth credentials are verified by the isolated OAuth contract suite.
  DEPLOY_COMMIT: process.env.VALIDATION_REVISION ?? "local-working-tree",
  TEST_ENABLE_MOCK_TOKENS: "false",
  PLANNING_CANARY_USER_IDS: "00000000-0000-4000-8000-000000000001",
  POSTGRES_URL: database.href,
});
const directory = path.join(root, "test-results/production-validation");
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(
  path.join(directory, "wrangler.local.json"),
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  "Prepared isolated local Worker configuration; production bindings and credentials are not used.",
);
