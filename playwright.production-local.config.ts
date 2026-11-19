import { defineConfig } from "@playwright/test";

const database = new URL(process.env.E2E_POSTGRES_URL ?? "");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
  !/test/i.test(database.pathname)
)
  throw new Error(
    "Production-local validation requires an isolated localhost test database",
  );

export default defineConfig({
  testDir: "./e2e/production-local",
  outputDir: "./test-results/production-validation/browser",
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "test-results/production-validation/report",
        open: "never",
      },
    ],
  ],
  workers: 1,
  retries: 0,
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:3352",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "./node_modules/.bin/next start -H 127.0.0.1 -p 3352",
    cwd: "./apps/web",
    url: "http://127.0.0.1:3352/login",
    timeout: 60000,
    env: {
      NODE_ENV: "production",
      AUTH_PROVIDER: "local",
      NEXT_PUBLIC_AUTH_PROVIDER: "local",
      ENABLE_MOCK_AUTH_SERVER: "false",
      API_PROXY_TARGET: "http://127.0.0.1:8787",
      NEXT_PUBLIC_API_URL: "",
    },
  },
});
