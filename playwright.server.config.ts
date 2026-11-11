import { defineConfig } from "@playwright/test";
const database = process.env.E2E_POSTGRES_URL;
if (
  !database ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(database).hostname) ||
  !/(test|e2e)/i.test(new URL(database).pathname)
) {
  throw new Error(
    "E2E_POSTGRES_URL must identify an isolated local test database with migrations applied.",
  );
}
export default defineConfig({
  outputDir: "./test-results/server",
  testDir: "./e2e/server",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3348" },
  webServer: [
    ...(process.env.E2E_SECURITY_WEB === "true" ? [{
      command: "./node_modules/.bin/next start -H 127.0.0.1 -p 3352",
      cwd: "./apps/web",
      url: "http://127.0.0.1:3352/login",
      timeout: 60000,
      env: { API_PROXY_TARGET: "http://127.0.0.1:3348", AUTH_PROVIDER: "local" },
    }] : []),
    { command: "node e2e/recovery-mail-server.mjs", url: "http://127.0.0.1:3350/health" },
    {
      command: "node e2e/ollama-test-server.mjs",
      url: "http://127.0.0.1:3349/health",
    },
    {
      command:
        "./node_modules/.bin/tsc && ./node_modules/.bin/tsx dist/index.js",
      cwd: "./apps/server",
      url: "http://127.0.0.1:3348/health",
      timeout: 60000,
      env: {
        NODE_ENV: "test",
        AUTH_PROVIDER: "local",
        CORS_ORIGINS: "http://127.0.0.1:3348,http://127.0.0.1:3352",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: "3351",
        SMTP_SECURE: "false",
        SMTP_FROM: "Horizon <no-reply@test.invalid>",
        PORT: "3348",
        SERVE_WEB: "false",
        DATABASE_PROVIDER: "postgres",
        POSTGRES_URL: database,
        MONGODB_URI: "mongodb://127.0.0.1:27017",
        JWT_SECRET: "isolated-e2e-secret-at-least-32-characters",
        AI_PROVIDER: "ollama",
        OLLAMA_BASE_URL: "http://127.0.0.1:3349/v1",
        OLLAMA_DETAIL_MODEL: "qwen3.5:9b",
        TEST_ENABLE_MOCK_TOKENS: "false",
        RATE_LIMIT_MAX: "1000",
      },
    },
  ],
});
