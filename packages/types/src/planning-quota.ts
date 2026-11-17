import type { PlanningJob } from "./journey";

/** A consumed V2 ticket must not be retried as if it were a fresh inference. */
export function planningQuotaState(
  job: PlanningJob | null | undefined,
  now = Date.now(),
) {
  const exhausted = job?.error_code === "AI_QUOTA_EXHAUSTED";
  const value = job?.error_params?.retry_at;
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  const retryAt = Number.isFinite(parsed) ? parsed : null;
  return {
    exhausted,
    retryAt,
    waiting: exhausted && retryAt !== null && retryAt > now,
    newRequestRequired: exhausted && job?.pipeline_version === 2,
  };
}
