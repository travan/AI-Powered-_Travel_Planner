import { describe, expect, it } from "vitest";
import { planningQuotaState } from "../../../../packages/types/src/planning-quota";
import { planningErrorMessage } from "../../../../apps/mobile/lib/planning-errors";
import { classifyJobError } from "../../../../apps/server/src/modules/itinerary/journey/planning-job-error";
import {
  PlanningGenerationError,
  isWorkersAiCapacity,
  isWorkersAiQuota,
} from "../../../../packages/ai/src/providers/planning-generation-error";
import type { PlanningJob } from "@travel/types";

const quotaJob: PlanningJob = {
  id: "job",
  kind: "generate",
  status: "failed",
  stage: "failed",
  attempts: 1,
  pipeline_version: 2,
  error_code: "AI_QUOTA_EXHAUSTED",
  error_params: { retry_at: "2026-11-17T00:00:00Z" },
};

describe("planning quota recovery", () => {
  it("waits until the reported reset and then requires a fresh V2 request", () => {
    expect(
      planningQuotaState(quotaJob, Date.parse("2026-11-16T14:00:00Z")),
    ).toMatchObject({
      exhausted: true,
      waiting: true,
      newRequestRequired: true,
    });
    expect(
      planningQuotaState(quotaJob, Date.parse("2026-11-17T01:00:00Z")),
    ).toMatchObject({ waiting: false, newRequestRequired: true });
    expect(
      planningQuotaState({ ...quotaJob, pipeline_version: 1 }),
    ).toMatchObject({ newRequestRequired: false });
  });
  it("does not invent reset times for missing or malformed timestamps", () => {
    expect(
      planningQuotaState({ ...quotaJob, error_params: {} }).retryAt,
    ).toBeNull();
    expect(
      planningQuotaState({ ...quotaJob, error_params: { retry_at: "invalid" } })
        .retryAt,
    ).toBeNull();
    const external = classifyJobError(
      new PlanningGenerationError(
        "AI_QUOTA_EXHAUSTED",
        undefined,
        undefined,
        "claude",
      ),
      "supplement",
      "generate",
    );
    expect(external.params).not.toHaveProperty("retry_at");
    const cloudflare = classifyJobError(
      new PlanningGenerationError(
        "AI_QUOTA_EXHAUSTED",
        undefined,
        undefined,
        "cloudflare",
      ),
      "supplement",
      "generate",
    );
    expect(cloudflare.params.retry_at).toMatch(/T00:00:00\.000Z$/);
  });
  it("distinguishes temporary capacity from exhausted daily allowance", () => {
    const busy = { code: 4006, message: "Service temporarily at capacity" };
    expect(isWorkersAiCapacity(busy)).toBe(true);
    expect(isWorkersAiQuota(busy)).toBe(false);
    expect(
      isWorkersAiQuota({
        code: 3036,
        message: "daily free allocation exhausted",
      }),
    ).toBe(true);
    expect(isWorkersAiQuota({ code: 4006, message: "AiError: you have used up your daily free allocation of 10,000 neurons" })).toBe(true);
    expect(isWorkersAiQuota({ code: 4006, message: "unknown provider failure" })).toBe(false);
  });
  it("shows mobile users the Vietnam reset time and an explicit fresh-request instruction", () => {
    const message = planningErrorMessage(
      quotaJob.error_code,
      "vi",
      quotaJob.error_params,
      2,
    );
    expect(message).toContain("07:00");
    expect(message).toContain("giờ Việt Nam");
    expect(message).toContain("yêu cầu mới");
    expect(planningErrorMessage("AI_QUOTA_EXHAUSTED", "vi", {})).toContain(
      "Chưa xác định",
    );
  });
});
