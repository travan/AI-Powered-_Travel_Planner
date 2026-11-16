import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { canarySession } from "./production-canary-auth.mjs";

const base = process.env.API_BASE_URL;
assert.ok(
  base && new URL(base).protocol === "https:",
  "HTTPS production API required",
);
const session = await canarySession(base, { register: true });
assert.match(session.userId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i);
assert.ok(process.env.GITHUB_ENV, "Run this account bootstrap from CI");
await fs.appendFile(
  process.env.GITHUB_ENV,
  `PLANNING_CANARY_USER_IDS=${session.userId}\n`,
);
console.log(
  "Dedicated canary account ready; no credentials written to reports.",
);
