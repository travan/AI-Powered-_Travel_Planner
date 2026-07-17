import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = __dirname;
const MOCK_API_PORT = process.env.E2E_MOCK_API_PORT ?? "3111";
const WEB_PORT = process.env.E2E_WEB_PORT ?? "3100";
const MOBILE_WEB_PORT = process.env.E2E_MOBILE_WEB_PORT ?? "8081";
const MOCK_API_URL = `http://127.0.0.1:${MOCK_API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const MOBILE_WEB_URL = `http://127.0.0.1:${MOBILE_WEB_PORT}`;
const SKIP_AUTH_CONTRACTS = process.env.SKIP_AUTH_CONTRACTS === "true";

export default defineConfig({
  globalSetup: path.join(ROOT, "e2e/global-setup.ts"),
  testDir: path.join(ROOT, "e2e/specs"),
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
      reuseExistingServer: !process.env.CI,
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
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: MOCK_API_URL,
        E2E_NEXT_PUBLIC_API_URL: MOCK_API_URL,
        E2E_API_PROXY_TARGET: MOCK_API_URL,
        API_PROXY_TARGET: MOCK_API_URL,
        AUTH_PROVIDER: "supabase",
        NEXT_PUBLIC_AUTH_PROVIDER: "supabase",
        ENABLE_MOCK_AUTH_SERVER: process.env.ENABLE_MOCK_AUTH_SERVER ?? "true",
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
    {
      command: `./node_modules/.bin/expo start --web --port ${MOBILE_WEB_PORT}`,
      cwd: path.join(ROOT, "apps/mobile"),
      url: MOBILE_WEB_URL,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        CI: "1",
        NODE_ENV: "development",
        EXPO_NO_TELEMETRY: "1",
        EXPO_ROUTER_APP_ROOT: "app",
        EXPO_PUBLIC_API_URL: MOCK_API_URL,
        EXPO_PUBLIC_ENABLE_MOCK_AUTH: process.env.EXPO_PUBLIC_ENABLE_MOCK_AUTH ?? "true",
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
        ? ["**/web.contract.spec.ts", "**/web.share-save.contract.spec.ts", "**/web.trips.spec.ts", "**/web.trip-collaboration.spec.ts", "**/web.nav.spec.ts"]
        : [
            "**/web.contract.spec.ts",
            "**/web.auth.contract.spec.ts",
            "**/web.auth.error.contract.spec.ts",
            "**/web.auth.oauth.spec.ts",
            "**/web.share-save.contract.spec.ts",
            "**/web.trips.spec.ts",
            "**/web.trip-collaboration.spec.ts",
            "**/web.nav.spec.ts",
          ],
      use: {
        baseURL: WEB_URL,
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "mobile-web",
      testMatch: SKIP_AUTH_CONTRACTS
        ? ["**/mobile-web.contract.spec.ts", "**/mobile-web.trips.spec.ts"]
        : [
            "**/mobile-web.contract.spec.ts",
            "**/mobile-web.auth.contract.spec.ts",
            "**/mobile-web.trips.spec.ts",
          ],
      use: {
        ...devices["Pixel 5"],
        baseURL: MOBILE_WEB_URL,
      },
    },
  ],
});
