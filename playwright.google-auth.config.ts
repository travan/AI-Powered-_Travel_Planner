import { defineConfig } from "@playwright/test";
const database = process.env.E2E_POSTGRES_URL;
if (
  !database ||
  !["127.0.0.1", "localhost"].includes(new URL(database).hostname) ||
  !/test|e2e/.test(new URL(database).pathname)
)
  throw new Error("E2E_POSTGRES_URL must be an isolated local test database");
export default defineConfig({
  testDir: "./e2e/google-auth",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3219", headless: true },
  webServer: [
    {
      command:
        "./apps/server/node_modules/.bin/tsx e2e/google-auth-test-server.mjs",
      url: "http://127.0.0.1:3319/health",
      timeout: 60000,
      env: { NODE_ENV: "test", E2E_POSTGRES_URL: database },
    },
    {
      command: "./node_modules/.bin/next dev --port 3219 --hostname 127.0.0.1",
      cwd: "./apps/web",
      url: "http://127.0.0.1:3219/login",
      timeout: 120000,
      env: {
        AUTH_PROVIDER: "local",
        NEXT_PUBLIC_AUTH_PROVIDER: "local",
        NEXT_PUBLIC_E2E_FORCE_REAL_AUTH_CLIENT: "false",
        API_PROXY_TARGET: "http://127.0.0.1:3319",
        E2E_API_PROXY_TARGET: "http://127.0.0.1:3319",
        NEXT_PUBLIC_API_URL: "",
        E2E_NEXT_PUBLIC_API_URL: "",
        ENABLE_MOCK_AUTH_SERVER: "false",
      },
    },
  ],
});
