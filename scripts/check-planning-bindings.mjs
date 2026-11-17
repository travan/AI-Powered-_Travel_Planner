import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export async function verifyPlanningBindings(config, api) {
  if (
    Number(config.vars?.PLANNING_V2_PERCENT ?? 0) === 0 &&
    !config.vars?.PLANNING_CANARY_USER_IDS?.trim()
  )
    return;
  const producer = config.queues?.producers?.find(
    (p) => p.binding === "JOURNEY_QUEUE",
  );
  assert.ok(producer, "Planning v2 requires JOURNEY_QUEUE");
  const expected = config.queues.consumers.find(
    (c) => c.queue === producer.queue,
  );
  assert.ok(
    expected?.dead_letter_queue,
    "Planning v2 requires a consumer and dead-letter queue",
  );
  const queues = await api("/queues?per_page=100");
  const queue = queues.find((q) => q.queue_name === producer.queue);
  assert.ok(queue, "Deployed generation queue missing");
  assert.ok(
    queues.some((q) => q.queue_name === expected.dead_letter_queue),
    "Dead-letter queue missing",
  );
  const settings = await api(
    `/workers/scripts/${encodeURIComponent(config.name)}/settings`,
  );
  const binding = settings.bindings?.find(
    (b) => b.type === "queue" && b.name === "JOURNEY_QUEUE",
  );
  assert.ok(binding, "Deployed producer binding missing");
  const destination = binding.queue_name ?? binding.queue ?? binding.queue_id;
  assert.ok(
    [queue.queue_name, queue.queue_id].includes(destination),
    "Producer points at a different queue",
  );
  const consumers = await api(`/queues/${queue.queue_id}/consumers`);
  const consumer = consumers.find(
    (c) => c.type === "worker" && (c.script ?? c.script_name) === config.name,
  );
  assert.ok(consumer, "Deployed consumer missing");
  assert.equal(
    consumer.dead_letter_queue,
    expected.dead_letter_queue,
    "Consumer DLQ mismatch",
  );
  assert.equal(
    consumer.settings?.max_concurrency,
    expected.max_concurrency,
    "Consumer concurrency mismatch",
  );
  assert.equal(
    consumer.settings?.batch_size,
    1,
    "A batch must contain one generation job",
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const path = process.env.WRANGLER_CONFIG ?? "apps/server/wrangler.jsonc";
  const { config, error } = ts.parseConfigFileTextToJson(
    path,
    await fs.readFile(path, "utf8"),
  );
  assert.ok(!error, "Invalid Worker configuration");
  await verifyPlanningBindings(config, async (resource) => {
    assert.ok(
      process.env.CLOUDFLARE_API_TOKEN,
      "Cloudflare token required for binding verification",
    );
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.account_id}${resource}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    const body = await response.json();
    assert.ok(
      response.ok && body.success,
      "Unable to verify deployed Cloudflare resources",
    );
    return body.result;
  });
  console.log("Planning Queue deployment bindings verified (or v2 disabled).");
}
