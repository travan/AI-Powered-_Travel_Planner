import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { cloudflareApiToken } from "./cloudflare-auth.mjs";
import { verifyFallbackSecrets } from "./check-planning-bindings.mjs";

const config = JSON.parse(await fs.readFile(process.env.WRANGLER_CONFIG ?? "apps/server/wrangler.generated.json", "utf8"));
if (JSON.parse(config.vars?.AI_FALLBACK_PROVIDERS || "[]").length) {
  const token = await cloudflareApiToken();
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.account_id}/workers/scripts/${encodeURIComponent(config.name)}/settings`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  assert.ok(response.ok && body.success, "Unable to verify Worker secrets");
  verifyFallbackSecrets(config, body.result);
}
console.log("Fallback secret bindings verified.");
