import path from "node:path";
import { execFileSync } from "node:child_process";

export default async function globalSetup() {
  const seedScript = path.join(__dirname, "../apps/api/scripts/seed-demo-itineraries.mjs");
  const apiDir = path.join(__dirname, "../apps/api");
  console.log("Running Supabase demo seed before Playwright tests...");

  try {
    execFileSync("pnpm", ["--dir", apiDir, "exec", "node", seedScript], {
      stdio: "inherit",
      env: process.env,
    });
  } catch (error) {
    console.warn("Supabase seed step failed or was skipped.", error instanceof Error ? error.message : error);
  }
}
