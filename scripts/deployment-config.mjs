import fs from "node:fs/promises";

/** Real infrastructure values live in an ignored local file or a CI secret. */
export async function privateDeploymentConfig(env = process.env) {
  let source = env.TRAVEL_PRODUCTION_CONFIG;
  if (!source && !env.CI) {
    try {
      source = await fs.readFile(
        new URL("../.private/deployment/production.json", import.meta.url),
        "utf8",
      );
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (!source) {
    if (env.REQUIRE_PRIVATE_DEPLOY_CONFIG === "true")
      throw new Error("Set production secret TRAVEL_PRODUCTION_CONFIG");
    return undefined;
  }
  let config;
  try {
    config = JSON.parse(source);
  } catch {
    throw new Error("Invalid private deployment configuration");
  }
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    !/^[a-z0-9]{20}$/.test(config.supabaseProjectRef ?? "") ||
    !/^[a-f0-9]{32}$/.test(config.worker?.account_id ?? "") ||
    !/^[a-f0-9]{32}$/.test(config.worker?.hyperdrive?.[0]?.id ?? "")
  )
    throw new Error(
      "Private deployment configuration requires project/account/Hyperdrive identifiers",
    );
  return config;
}
