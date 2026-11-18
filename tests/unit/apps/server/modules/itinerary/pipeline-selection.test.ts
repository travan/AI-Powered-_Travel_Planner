import { afterEach, describe, expect, it, vi } from "vitest";
import { pipelineOverride } from "../../../../../../apps/server/src/modules/itinerary/journey/pipeline-selection";
import { budgetErrorParams, validationErrorParams } from "../../../../../../apps/server/src/modules/itinerary/journey/planning-job-error";
import { JourneyService } from "../../../../../../apps/server/src/modules/itinerary/journey/journey.service";

afterEach(() => vi.unstubAllEnvs());
describe("production canary authorization", () => {
  it("keeps only safe estimate amounts and route diagnostics", () => {
    expect(budgetErrorParams({ estimated_total: 16170000, budget_total: 10000075, currency: "VND", raw: "private" })).toEqual({ estimated_total: 16170000, budget_total: 10000075, currency: "VND" });
    expect(validationErrorParams({ issue_1_code: "JOURNEY_LEG_MISSING", issue_1_slot: "day" })).toEqual({ issue_1_code: "JOURNEY_LEG_MISSING", issue_1_slot: "day" });
  });
  it("expires admitted V2 jobs even while the general rollout is zero", async () => {
    vi.stubEnv("PLANNING_V2_PERCENT", "0");
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const service = new JourneyService({ query }, {} as never, {} as never);
    await service.expireJobs();
    expect(
      query.mock.calls.some(
        ([sql]) =>
          sql.includes("pipeline_version=2") &&
          sql.includes("deadline_at<=now()"),
      ),
    ).toBe(true);
  });
  it("does not resume an exhausted V2 ticket even after the reset time has passed", async () => {
    const resume = vi.fn();
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          pipeline_version: 2,
          error_code: "AI_QUOTA_EXHAUSTED",
          error_params: { retry_at: "2020-01-01T00:00:00Z" },
          payload: { dto: {} },
        },
      ],
    });
    const service = new JourneyService(
      { query },
      {} as never,
      {} as never,
      { resume } as never,
    );
    await expect(service.retryJob("user", "job")).rejects.toMatchObject({
      response: { code: "AI_QUOTA_EXHAUSTED" },
    });
    expect(resume).not.toHaveBeenCalled();
  });
  it("requires an explicit authenticated user ID allowlist, even for v1", () => {
    vi.stubEnv("PLANNING_CANARY_USER_IDS", "test-user");
    expect(pipelineOverride("test-user", "v2")).toBe(2);
    expect(pipelineOverride("test-user", "v1")).toBe(1);
    expect(pipelineOverride("normal-user")).toBeUndefined();
    expect(() => pipelineOverride("normal-user", "v2")).toThrow();
    expect(() => pipelineOverride("normal-user", "v1")).toThrow();
    expect(() => pipelineOverride("test-user", "invalid")).toThrow();
  });
  it("retains safe V2 day diagnostics in polling", async () => {
    const service = new JourneyService(
      {
        query: vi.fn().mockResolvedValue({
          rows: [
            {
              id: "job",
              status: "failed",
              error_code: "PLANNING_DATA_INSUFFICIENT",
              error_params: {
                reason: "schedule_constraints_unsatisfied",
                day: 6,
                issue_1_code: "SCHEDULE_CONFLICT",
                issue_1_slot: "day",
                raw: "private",
              },
            },
          ],
        }),
      },
      {} as never,
      {} as never,
    );
    const result = await service.getJob("user", "job");
    expect(result.error_params).toEqual({
      reason: "schedule_constraints_unsatisfied",
      day: 6,
      issue_1_code: "SCHEDULE_CONFLICT",
      issue_1_slot: "day",
    });
  });
  it("publishes bounded validation identifiers, never arbitrary model data", () => {
    expect(
      validationErrorParams({
        day: 10,
        issue_1_code: "DAY_ENTRY_INCOMPLETE",
        issue_1_slot: "return",
        issue_2_code: "secret response",
        issue_2_slot: "return",
        raw: "private",
        issue_6_code: "DAY_PRICE_INVALID",
        issue_6_slot: "breakfast",
      }),
    ).toEqual({
      day: 10,
      issue_1_code: "DAY_ENTRY_INCOMPLETE",
      issue_1_slot: "return",
    });
  });
});
