import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = __dirname;
const API_PORT = process.env.E2E_LOCAL_AUTH_API_PORT ?? "3302";
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_PORT = process.env.E2E_LOCAL_AUTH_WEB_PORT ?? "3202";
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
const MOBILE_PORT = process.env.E2E_LOCAL_AUTH_MOBILE_PORT ?? "8282";
const MOBILE_URL = `http://127.0.0.1:${MOBILE_PORT}`;

export default defineConfig({
  testDir: path.join(ROOT, "e2e/specs"),
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-local-auth", open: "never" }]],
  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node ./e2e/mock-api-server.mjs",
      cwd: ROOT,
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      env: { ...process.env, PORT: API_PORT },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    },
    {
      command: `./node_modules/.bin/next dev --hostname 127.0.0.1 --port ${WEB_PORT}`,
      cwd: path.join(ROOT, "apps/web"),
      url: `${WEB_URL}/login`,
      reuseExistingServer: false,
      env: {
        ...process.env,
        API_PROXY_TARGET: API_URL,
        E2E_API_PROXY_TARGET: API_URL,
        NEXT_PUBLIC_API_URL: API_URL,
        E2E_NEXT_PUBLIC_API_URL: API_URL,
        AUTH_PROVIDER: "local",
        NEXT_PUBLIC_AUTH_PROVIDER: "local",
        ENABLE_MOCK_AUTH_SERVER: "false",
        NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
    {
      command: `./node_modules/.bin/expo start --web --port ${MOBILE_PORT}`,
      cwd: path.join(ROOT, "apps/mobile"),
      url: MOBILE_URL,
      reuseExistingServer: false,
      env: {
        ...process.env,
        CI: "1",
        NODE_ENV: "development",
        EXPO_NO_TELEMETRY: "1",
        EXPO_ROUTER_APP_ROOT: "app",
        EXPO_PUBLIC_API_URL: API_URL,
        EXPO_PUBLIC_AUTH_PROVIDER: "local",
        EXPO_PUBLIC_ENABLE_MOCK_AUTH: "false",
        EXPO_PUBLIC_WEB_URL: WEB_URL,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: "web-local-auth",
      testMatch: "**/web.local-auth.e2e.spec.ts",
      use: { baseURL: WEB_URL, viewport: { width: 1440, height: 960 } },
    },
    {
      name: "mobile-local-auth",
      testMatch: "**/mobile-web.local-auth.e2e.spec.ts",
      use: { ...devices["Pixel 5"], baseURL: MOBILE_URL },
    },
  ],
});
