import { describe, expect, it, vi } from "vitest";
import {
  verifyFallbackSecrets,
  verifyPlanningBindings,
  verifyPlanningBindingsWithRetry,
} from "../../scripts/check-planning-bindings.mjs";
const config = {
  name: "staging",
  vars: { PLANNING_V2_PERCENT: "100" },
  queues: {
    producers: [{ binding: "JOURNEY_QUEUE", queue: "jobs" }],
    consumers: [
      { queue: "jobs", dead_letter_queue: "dead", max_concurrency: 4 },
    ],
  },
};
const queues = [
  { queue_name: "jobs", queue_id: "id" },
  { queue_name: "dead", queue_id: "dlq" },
];
const binding = { type: "queue", name: "JOURNEY_QUEUE", queue_name: "jobs" };
const consumer = {
  type: "worker",
  script: "staging",
  dead_letter_queue: "dead",
  settings: { max_concurrency: 4, batch_size: 1 },
};
function api(bindings = [binding], consumers = [consumer]) {
  return vi.fn(async (resource) =>
    resource.startsWith("/queues?")
      ? queues
      : resource.endsWith("/settings")
        ? { bindings }
        : consumers,
  );
}
describe("deployed planning resources", () => {
  it("waits for a producer binding to propagate after deployment", async () => {
    const request = api();
    request
      .mockImplementationOnce(async () => queues)
      .mockImplementationOnce(async () => ({ bindings: [] }));
    const sleep = vi.fn();
    await expect(
      verifyPlanningBindingsWithRetry(config, request, { sleep }),
    ).resolves.toBeUndefined();
    expect(sleep).toHaveBeenCalledExactlyOnceWith(5000);
    expect(
      request.mock.calls.filter(([resource]) => resource.endsWith("/settings")),
    ).toHaveLength(2);
  });
  it("does not retry already consistent resources", async () => {
    const sleep = vi.fn();
    await verifyPlanningBindingsWithRetry(config, api(), { sleep });
    expect(sleep).not.toHaveBeenCalled();
  });
  it("still fails when the deployed queue is persistently wrong", async () => {
    const sleep = vi.fn();
    await expect(
      verifyPlanningBindingsWithRetry(
        config,
        api([{ ...binding, queue_name: "wrong" }]),
        { sleep },
      ),
    ).rejects.toThrow("different queue");
    expect(sleep).toHaveBeenCalledTimes(11);
  });
  it("requires fallback credentials to be encrypted Worker secrets", () => {
    const configured = {
      vars: {
        AI_FALLBACK_PROVIDERS: JSON.stringify([
          { id: "gemini-1", key_env: "GEMINI_API_KEY" },
        ]),
      },
    };
    expect(() =>
      verifyFallbackSecrets(configured, {
        bindings: [{ type: "plain_text", name: "GEMINI_API_KEY" }],
      }),
    ).toThrow("encrypted Worker secret");
    expect(() =>
      verifyFallbackSecrets(configured, {
        bindings: [{ type: "secret_text", name: "GEMINI_API_KEY" }],
      }),
    ).not.toThrow();
  });
  it("checks the real producer and consumer settings", async () => {
    await expect(
      verifyPlanningBindings(config, api()),
    ).resolves.toBeUndefined();
  });
  it("accepts the legacy script_name response shape", async () => {
    const { script, ...rest } = consumer;
    await expect(
      verifyPlanningBindings(
        config,
        api([binding], [{ ...rest, script_name: script }]),
      ),
    ).resolves.toBeUndefined();
  });
  it("rejects a producer without a deployed consumer", async () => {
    await expect(
      verifyPlanningBindings(config, api([binding], [])),
    ).rejects.toThrow("consumer missing");
  });
  it("rejects a binding pointing to another queue", async () => {
    await expect(
      verifyPlanningBindings(
        config,
        api([{ ...binding, queue_name: "wrong" }]),
      ),
    ).rejects.toThrow("different queue");
  });
  it("rejects an uncapped consumer", async () => {
    await expect(
      verifyPlanningBindings(
        config,
        api(
          [binding],
          [{ ...consumer, settings: { batch_size: 1, max_concurrency: null } }],
        ),
      ),
    ).rejects.toThrow("concurrency mismatch");
  });
});
