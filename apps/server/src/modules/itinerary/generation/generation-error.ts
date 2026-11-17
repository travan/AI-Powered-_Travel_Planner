import { HttpException } from "@nestjs/common";
export type GenerationErrorCode =
  | "PLANNING_DATA_INSUFFICIENT"
  | "PLANNING_BUDGET_UNSATISFIABLE"
  | "AI_RESPONSE_INVALID"
  | "AI_RESULT_UNKNOWN"
  | "GENERATION_DEADLINE_EXCEEDED";
const reasons = new Set([
  "proposal_name_unspecific",
  "required_dining_unverified",
  "required_stay_unverified",
  "required_experience_unverified",
  "meal_budget_exceeded",
  "nightly_budget_exceeded",
  "no_available_dates",
  "more_destinations_than_days",
  "context_limit",
  "supplement_invalid",
  "city_proposal_invalid",
  "proposed_city_unresolved",
  "city_country_mismatch",
  "city_unresolved",
  "unpriced_slot",
  "lodging_price_missing",
  "main_travel_price_missing",
  "group_total_exceeds_budget",
  "mandatory_travel_and_stay_exceed_budget",
  "budget_incomplete",
  "schedule_constraints_unsatisfied",
  "duplicate_place",
  "main_travel_schedule_unavailable",
]);
export function generationErrorParams(value: unknown): Record<string, string> {
  return typeof value === "string" && reasons.has(value)
    ? { reason: value }
    : {};
}
export function generationError(
  code: GenerationErrorCode,
  reason?: string,
  details: Record<string, string | number> = {},
): never {
  throw new HttpException(
    {
      code,
      params: { ...details, ...(reason ? { reason } : {}) },
      message: code,
    },
    422,
  );
}
