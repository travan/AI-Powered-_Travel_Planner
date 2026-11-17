export type PlanningFailureDetails = {
  day?: number;
  issues: { code: string; slot?: string }[];
};

export class PlanningGenerationError extends Error {
  constructor(
    readonly code:
      | "AI_QUOTA_EXHAUSTED"
      | "AI_OUTLINE_INVALID"
      | "AI_DAY_INVALID"
      | "AI_PROVIDER_CONFIGURATION_INVALID"
      | "AI_AUTH_INVALID"
      | "AI_RATE_LIMITED"
      | "AI_UNAVAILABLE"
      | "AI_RESPONSE_INVALID"
      | "AI_RESULT_UNKNOWN",
    message?: string,
    readonly details?: PlanningFailureDetails,
    readonly provider?: string,
  ) {
    super(message ?? code);
  }
}

export function isWorkersAiQuota(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string | number; message?: string };
  if (/capacity|temporarily busy|rate.?limit/i.test(value.message ?? ""))
    return false;
  return (
    String(value.code) === "4006" ||
    String(value.code) === "3036" ||
    /^(?:AiError:\s*)?(?:4006|3036):/i.test(value.message ?? "")
  );
}

export function isWorkersAiCapacity(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string | number; message?: string };
  return (
    String(value.code) === "3040" ||
    /^AiError:\s*3040:|^3040:/i.test(value.message ?? "") ||
    /capacity|temporarily busy|rate.?limit/i.test(value.message ?? "")
  );
}
