import fs from "node:fs/promises";
import assert from "node:assert/strict";
import ts from "typescript";

const filename =
  process.env.WRANGLER_CONFIG ?? "apps/server/wrangler.generated.json";
const { config, error } = ts.parseConfigFileTextToJson(
  filename,
  await fs.readFile(filename, "utf8"),
);
assert.ok(
  !error && process.env.CLOUDFLARE_API_TOKEN,
  "Valid config and Cloudflare credentials required",
);
const producer = config.queues?.producers?.find(
  (item) => item.binding === "JOURNEY_QUEUE",
);
const consumer = config.queues?.consumers?.find(
  (item) => item.queue === producer?.queue,
);
assert.ok(
  producer && consumer?.dead_letter_queue,
  "Queue producer, consumer and DLQ configuration required",
);
async function api(path, init) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${config.account_id}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  const result = await response.json();
  assert.ok(
    response.ok && result.success,
    `Queue provisioning failed (HTTP ${response.status})`,
  );
  return result.result;
}
const queues = await api("/queues?per_page=100");
for (const name of [producer.queue, consumer.dead_letter_queue]) {
  if (queues.some((queue) => queue.queue_name === name))
    console.log(`Queue exists: ${name}`);
  else {
    await api("/queues", {
      method: "POST",
      body: JSON.stringify({ queue_name: name }),
    });
    console.log(`Queue created: ${name}`);
  }
}
