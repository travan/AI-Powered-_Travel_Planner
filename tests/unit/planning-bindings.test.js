import { describe, expect, it, vi } from "vitest";
import { verifyPlanningBindings } from "../../scripts/check-planning-bindings.mjs";
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
  script_name: "staging",
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
  it("checks the real producer and consumer settings", async () => {
    await expect(
      verifyPlanningBindings(config, api()),
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
