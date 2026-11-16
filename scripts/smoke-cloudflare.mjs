import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";

// Read-only checks: validation neither queues AI jobs nor creates trip records.
export async function checkCloudflare(
  baseUrl,
  expectedCommit,
  request = fetch,
) {
  async function json(path, options) {
    const response = await request(new URL(path, baseUrl), {
      ...options,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
  }
  const health = await json("/health");
  if (health.status !== "ok" || health.services?.postgres !== "ok") {
    throw new Error("Database health check failed");
  }
  if (!expectedCommit || health.deploy_commit !== expectedCommit) {
    throw new Error("Production is not serving the expected commit");
  }
  const expectedPercent = Number(process.env.EXPECTED_PLANNING_V2_PERCENT || 0);
  if (
    expectedPercent > 0 &&
    (health.planning_pipeline?.v2_percent !== expectedPercent ||
      health.planning_pipeline?.queue_bound !== true)
  )
    throw new Error(
      "Production planning pipeline/Queue binding does not match the rollout configuration",
    );
  const config = await json("/api/planning/config");
  if (config.schema_version !== 2 || config.enabled !== true) {
    throw new Error("Journey planner configuration is unavailable");
  }
  const result = await json("/api/planning/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cities: ["Da Nang"],
      num_days: 3,
      currency: "VND",
      trip_style: "mixed",
      num_travelers: 2,
      locale: "en",
    }),
  });
  if (result.valid !== true || !Array.isArray(result.issues)) {
    throw new Error("Planner validation response has an unexpected contract");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const baseUrl = process.env.API_BASE_URL;
  const commit = process.env.EXPECTED_DEPLOY_COMMIT;
  if (!baseUrl || !commit)
    throw new Error("API_BASE_URL and EXPECTED_DEPLOY_COMMIT are required");
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await checkCloudflare(baseUrl, commit);
      console.log(
        `Cloudflare health, revision and planner routes verified (${commit})`,
      );
      break;
    } catch (error) {
      console.error(`Smoke check ${attempt}/6: ${error.message}`);
      if (attempt === 6) process.exitCode = 1;
      else await setTimeout(10000);
    }
  }
}
