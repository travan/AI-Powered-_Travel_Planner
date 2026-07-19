import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, devices, expect } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "test-results", `visual-audit-${new Date().toISOString().replace(/[:.]/g, "-")}`);

const ports = {
  api: process.env.VISUAL_API_PORT ?? "3122",
  web: process.env.VISUAL_WEB_PORT ?? "3022",
  mobile: process.env.VISUAL_MOBILE_PORT ?? "8092",
};

const urls = {
  api: `http://127.0.0.1:${ports.api}`,
  web: `http://127.0.0.1:${ports.web}`,
  mobile: `http://127.0.0.1:${ports.mobile}`,
};

const children = [];
const screenshots = [];

await mkdir(outputDir, { recursive: true });

try {
  await startServers();
  await runVisualAudit();
  await writeGallery();
  console.log(`Visual audit complete: ${outputDir}`);
} finally {
  for (const child of children.reverse()) {
    child.kill("SIGTERM");
  }
}

async function startServers() {
  spawnManaged("mock-api", "node", ["./e2e/mock-api-server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: ports.api },
  });

  spawnManaged("web", "./node_modules/.bin/next", ["dev", "--hostname", "127.0.0.1", "--port", ports.web], {
    cwd: path.join(root, "apps/web"),
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: urls.api,
      API_PROXY_TARGET: urls.api,
      ENABLE_MOCK_AUTH_SERVER: "true",
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
    },
  });

  spawnManaged("mobile-web", "./node_modules/.bin/expo", ["start", "--web", "--port", ports.mobile], {
    cwd: path.join(root, "apps/mobile"),
    env: {
      ...process.env,
      CI: "1",
      NODE_ENV: "development",
      EXPO_NO_TELEMETRY: "1",
      EXPO_ROUTER_APP_ROOT: "app",
      EXPO_PUBLIC_API_URL: urls.api,
      EXPO_PUBLIC_ENABLE_MOCK_AUTH: "true",
      EXPO_PUBLIC_WEB_URL: urls.web,
    },
  });

  await Promise.all([
    waitForUrl(`${urls.api}/health`, "mock API"),
    waitForUrl(`${urls.web}/plan`, "web"),
    waitForUrl(urls.mobile, "mobile web"),
  ]);
}

function spawnManaged(name, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${name}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${name}] ${chunk}`);
  });
  child.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM") {
      process.stderr.write(`[${name}] exited with code=${code} signal=${signal}\n`);
    }
  });
}

async function waitForUrl(url, label) {
  const deadline = Date.now() + 180_000;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for ${label} at ${url}: ${lastError}`);
}

async function runVisualAudit() {
  const browser = await chromium.launch({ headless: true });
  try {
    await runWebFlow(browser);
    await runMobileFlow(browser);
  } finally {
    await browser.close();
  }
}

async function runWebFlow(browser) {
  const context = await browser.newContext({
    baseURL: urls.web,
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();

  await page.goto("/login");
  await shot(page, "01-web-login", "Web login");

  await page.goto("/signup");
  await shot(page, "02-web-signup", "Web signup");

  await page.getByTestId("web-auth-full-name").fill("Visual Traveler");
  await page.getByTestId("web-auth-email").fill(`visual.${Date.now()}@horizon.mock`);
  await page.getByTestId("web-auth-password").fill("secret123");
  await page.getByTestId("web-auth-submit-signup").click();
  await expect(page).toHaveURL(/\/plan/, { timeout: 20_000 });
  await shot(page, "03-web-plan-authenticated", "Web plan after signup");

  await page.getByTestId("web-plan-city-input").fill("Tokyo");
  await page.getByTestId("web-plan-city-input").press("Enter");
  await shot(page, "04-web-plan-city-selected", "Web plan with city selected");

  await page.locator("[data-testid='web-plan-generate']:visible").first().click();
  await expect(page).toHaveURL(/\/trips/, { timeout: 25_000 });
  await expect(page.getByTestId("web-trips-overview-card")).toBeVisible({ timeout: 20_000 });
  await shot(page, "05-web-trips-overview", "Web trips overview");

  await page.getByTestId("web-trips-detail-link").first().click();
  await expect(page.getByTestId("web-itinerary-title")).toHaveText("Tokyo Discovery", { timeout: 20_000 });
  await shot(page, "06-web-itinerary-detail", "Web itinerary detail");

  const shareButton = page.getByRole("button", { name: "Share" });
  await expect(shareButton).toBeVisible();
  await shareButton.click();
  await shot(page, "07-web-share-clicked", "Web share interaction");

  await context.close();
}

async function runMobileFlow(browser) {
  const pixel = devices["Pixel 5"];
  const context = await browser.newContext({
    ...pixel,
    baseURL: urls.mobile,
  });
  const page = await context.newPage();

  page.on("dialog", async (dialog) => dialog.accept());

  await page.goto("/");
  await injectMobileSession(page);
  await page.goto("/plan");
  await shot(page, "08-mobile-plan", "Mobile plan");

  await page.getByTestId("mobile-plan-city-input").fill("Tokyo");
  await page.getByTestId("mobile-plan-add-city").click();
  await shot(page, "09-mobile-plan-city-selected", "Mobile plan with city selected");

  await page.getByTestId("mobile-plan-generate").click();
  await expect(page).toHaveURL(/\/trips/, { timeout: 30_000 });
  await expect(page.getByTestId("mobile-trips-overview-card")).toBeVisible({ timeout: 30_000 });
  await shot(page, "10-mobile-trips-overview", "Mobile trips overview");

  await page.getByTestId("mobile-trips-detail-link").first().click();
  await expect(page.getByTestId("mobile-itinerary-title")).toHaveText("Tokyo Discovery", { timeout: 30_000 });
  await shot(page, "11-mobile-itinerary-detail", "Mobile itinerary detail");

  await page.goto("/profile");
  await shot(page, "12-mobile-profile", "Mobile profile");

  await page.goto("/saved");
  await shot(page, "13-mobile-saved", "Mobile saved");

  await context.close();
}

async function injectMobileSession(page) {
  await page.evaluate(() => {
    const session = {
      access_token: "mock-mobile-access-visual-user",
      refresh_token: "mock-refresh-visual-user",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: "mock-visual-user",
        email: "visual@horizon.mock",
        user_metadata: {},
      },
    };
    window.localStorage.setItem("horizon.mobile.mock.session", JSON.stringify(session));
  });
}

async function shot(page, slug, title) {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  const fileName = `${slug}.png`;
  const filePath = path.join(outputDir, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  screenshots.push({ title, fileName });
  console.log(`Captured ${fileName}`);
}

async function writeGallery() {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Horizon Visual Audit</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #10130f; color: #f8f3e8; }
    header { padding: 32px; position: sticky; top: 0; background: rgba(16, 19, 15, .92); backdrop-filter: blur(14px); border-bottom: 1px solid rgba(248, 243, 232, .16); }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { margin: 0; color: #d8d0c2; }
    main { display: grid; gap: 28px; padding: 28px; }
    figure { margin: 0; border: 1px solid rgba(248, 243, 232, .16); border-radius: 18px; overflow: hidden; background: #191d16; box-shadow: 0 20px 60px rgba(0, 0, 0, .32); }
    figcaption { padding: 14px 18px; font-weight: 700; letter-spacing: .01em; }
    img { width: 100%; display: block; background: white; }
  </style>
</head>
<body>
  <header>
    <h1>Horizon Visual Audit</h1>
    <p>${new Date().toLocaleString()}</p>
  </header>
  <main>
    ${screenshots.map((item) => `<figure><figcaption>${item.title}</figcaption><img src="./${item.fileName}" alt="${item.title}" /></figure>`).join("\n    ")}
  </main>
</body>
</html>`;

  await writeFile(path.join(outputDir, "index.html"), html, "utf8");
}
