import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = __dirname;
const MOCK_API_PORT = process.env.E2E_MOCK_API_PORT ?? "3301";
const MOCK_API_URL = `http://127.0.0.1:${MOCK_API_PORT}`;
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3200";
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const MOBILE_PORT = process.env.E2E_MOBILE_PORT ?? "8281";
const MOBILE_URL = `http://127.0.0.1:${MOBILE_PORT}`;
const SKIP_AUTH_CONTRACTS = process.env.SKIP_AUTH_CONTRACTS === "true";
const REUSE_E2E_SERVERS = process.env.E2E_REUSE_SERVERS === "true";

export default defineConfig({
  globalSetup: path.join(ROOT, "e2e/global-setup.ts"),
  testDir: path.join(ROOT, "e2e/specs"),
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  // The mock API server keeps business fixtures in memory, so E2E specs that
  // mutate trip collaboration state must run serially until fixtures are scoped
  // per test id.
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node ./e2e/mock-api-server.mjs",
      cwd: ROOT,
      url: `${MOCK_API_URL}/health`,
      reuseExistingServer: REUSE_E2E_SERVERS,
      env: {
        ...process.env,
        PORT: MOCK_API_PORT,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    },
    {
      command: `./node_modules/.bin/next dev --hostname 127.0.0.1 --port ${WEB_PORT}`,
      cwd: path.join(ROOT, "apps/web"),
      url: `${WEB_URL}/plan`,
      reuseExistingServer: REUSE_E2E_SERVERS,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: MOCK_API_URL,
        API_PROXY_TARGET: MOCK_API_URL,
        AUTH_PROVIDER: "mock",
        NEXT_PUBLIC_AUTH_PROVIDER: "mock",
        ENABLE_MOCK_AUTH_SERVER: "true",
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
    {
      command: `./node_modules/.bin/expo start --web --port ${MOBILE_PORT}`,
      cwd: path.join(ROOT, "apps/mobile"),
      url: MOBILE_URL,
      reuseExistingServer: REUSE_E2E_SERVERS,
      env: {
        ...process.env,
        CI: "1",
        NODE_ENV: "development",
        EXPO_NO_TELEMETRY: "1",
        EXPO_ROUTER_APP_ROOT: "app",
        EXPO_PUBLIC_API_URL: MOCK_API_URL,
        EXPO_PUBLIC_ENABLE_MOCK_AUTH: "true",
        EXPO_PUBLIC_WEB_URL: WEB_URL,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: "web-desktop",
      testMatch: SKIP_AUTH_CONTRACTS
        ? [
            "**/web.contract.spec.ts",
            "**/web.share-save.contract.spec.ts",
            "**/web.trip-business.contract.spec.ts",
            "**/web.full-flow.spec.ts",
            "**/web.full-flow.screenshots.spec.ts",
            "**/web.trip-workspace.ui.spec.ts",
            "**/web.trips.spec.ts",
            "**/web.nav.spec.ts",
          ]
        : [
            "**/web.contract.spec.ts",
            "**/web.auth.contract.spec.ts",
            "**/web.auth.error.contract.spec.ts",
            "**/web.auth.oauth.spec.ts",
            "**/web.share-save.contract.spec.ts",
            "**/web.trip-business.contract.spec.ts",
            "**/web.full-flow.spec.ts",
            "**/web.full-flow.screenshots.spec.ts",
            "**/web.trip-workspace.ui.spec.ts",
            "**/web.trips.spec.ts",
            "**/web.nav.spec.ts",
          ],
      use: {
        baseURL: WEB_URL,
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "web-mobile-responsive",
      testMatch: ["**/web.trip-workspace.ui.spec.ts"],
      use: {
        ...devices["Pixel 5"],
        baseURL: WEB_URL,
      },
    },
    {
      name: "mobile-web",
      testMatch: SKIP_AUTH_CONTRACTS
        ? [
            "**/mobile-web.contract.spec.ts",
            "**/mobile-web.full-flow.spec.ts",
            "**/mobile-web.full-flow.screenshots.spec.ts",
            "**/mobile-web.trips.spec.ts",
          ]
        : [
            "**/mobile-web.contract.spec.ts",
            "**/mobile-web.auth.contract.spec.ts",
            "**/mobile-web.full-flow.spec.ts",
            "**/mobile-web.full-flow.screenshots.spec.ts",
            "**/mobile-web.trips.spec.ts",
          ],
      use: {
        ...devices["Pixel 5"],
        baseURL: MOBILE_URL,
      },
    },
  ],
});
