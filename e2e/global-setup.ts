import path from "node:path";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

export default async function globalSetup() {
  if (process.env["E2E_SEED_LEGACY_SUPABASE"] !== "true") {
    console.log("Skipping legacy Supabase demo seed. Set E2E_SEED_LEGACY_SUPABASE=true to opt in.");
    return;
  }

  const seedScript = path.join(__dirname, "../apps/api/scripts/seed-demo-itineraries.mjs");
  const apiDir = path.join(__dirname, "../apps/api");
  const databaseProvider = process.env.DATABASE_PROVIDER ?? "postgres";

  if (databaseProvider !== "supabase") {
    console.log(`Skipping Supabase demo seed: DATABASE_PROVIDER=${databaseProvider}.`);
    return;
  }

  if (!existsSync(seedScript)) {
    console.log("Skipping Supabase demo seed: script not found in this checkout.");
    return;
  }

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
