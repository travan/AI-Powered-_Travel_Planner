import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const envPath = path.join(projectRoot, ".env");
if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

const port = process.env.POSTGRES_PORT || "5433";
const databaseName = process.env.POSTGRES_DB || "travel_planner";
const appUser = process.env.POSTGRES_APP_USER || "travel_planner";
const appPassword = process.env.POSTGRES_APP_PASSWORD || "travel_planner";
const adminUser = process.env.POSTGRES_USER || "postgres";
const adminPassword = process.env.POSTGRES_PASSWORD || "postgres";
const appUrl = new URL(
  `postgres://${encodeURIComponent(appUser)}:${encodeURIComponent(appPassword)}@127.0.0.1:${port}/${encodeURIComponent(databaseName)}`,
);
const adminUrl = new URL(
  `postgres://${encodeURIComponent(adminUser)}:${encodeURIComponent(adminPassword)}@127.0.0.1:${port}/postgres`,
);

const child = spawn(
  process.execPath,
  [path.join(projectRoot, "apps/server/scripts/init-local-postgres.mjs")],
  {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_PROVIDER: "postgres",
      POSTGRES_URL: appUrl.toString(),
      POSTGRES_ADMIN_URL: adminUrl.toString(),
    },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error("Could not start the local Docker PostgreSQL bootstrap:", error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }

  const seed = spawn(
    process.execPath,
    [path.join(projectRoot, "apps/server/scripts/seed-vietnam-cities.mjs")],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_PROVIDER: "postgres",
        POSTGRES_URL: appUrl.toString(),
        DATABASE_URL: appUrl.toString(),
        POSTGRES_URLS: "",
        DATABASE_URLS: "",
      },
      stdio: "inherit",
    },
  );

  seed.on("error", (error) => {
    console.error("Could not start the local PostgreSQL city seed:", error.message);
    process.exitCode = 1;
  });
  seed.on("exit", (seedCode, seedSignal) => {
    if (seedSignal) {
      process.kill(process.pid, seedSignal);
    } else {
      process.exitCode = seedCode ?? 1;
    }
  });
});
