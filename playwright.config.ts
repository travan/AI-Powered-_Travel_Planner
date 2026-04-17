import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const ROOT = __dirname;
const MOCK_API_URL = "http://127.0.0.1:3101";

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
        PORT: "3101",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    },
    {
      command: "./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3000",
      cwd: path.join(ROOT, "apps/web"),
      url: "http://127.0.0.1:3000/plan",
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: MOCK_API_URL,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    },
    {
      command: "./node_modules/.bin/expo start --web --port 8081 --non-interactive",
      cwd: path.join(ROOT, "apps/mobile"),
      url: "http://127.0.0.1:8081",
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        CI: "1",
        EXPO_NO_TELEMETRY: "1",
        EXPO_PUBLIC_API_URL: MOCK_API_URL,
        EXPO_PUBLIC_WEB_URL: "http://127.0.0.1:3000",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 180_000,
    },
  ],
  projects: [
    {
      name: "web-desktop",
      testMatch: [
        "**/web.contract.spec.ts",
        "**/web.share-save.contract.spec.ts",
      ],
      use: {
        baseURL: "http://127.0.0.1:3000",
        viewport: { width: 1440, height: 960 },
      },
    },
    {
      name: "mobile-web",
      testMatch: /mobile-web\.contract\.spec\.ts/,
      use: {
        ...devices["Pixel 5"],
        baseURL: "http://127.0.0.1:8081",
      },
    },
  ],
});
