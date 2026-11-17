import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const keys = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"];
const required = { claude: keys[0], openai: keys[1], gemini: keys[2] }[
  process.env.DEPLOY_AI_PROVIDER
];
if (required)
  assert.ok(
    process.env[required]?.trim(),
    `Missing ${required} deployment secret`,
  );
const secrets = Object.fromEntries(
  keys
    .filter((key) => process.env[key]?.trim())
    .map((key) => [key, process.env[key]]),
);
if (Object.keys(secrets).length) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "planning-secrets-"),
  );
  const filename = path.join(directory, "secrets.json");
  try {
    await fs.writeFile(filename, JSON.stringify(secrets), { mode: 0o600 });
    const result = spawnSync(
      "pnpm",
      [
        "dlx",
        "wrangler@4.155.0",
        "secret",
        "bulk",
        filename,
        "--config",
        process.env.WRANGLER_CONFIG ?? "apps/server/wrangler.generated.json",
      ],
      { stdio: "inherit" },
    );
    assert.equal(result.status, 0, "Unable to sync selected provider secrets");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
