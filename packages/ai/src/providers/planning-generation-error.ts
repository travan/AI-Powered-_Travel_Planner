export class PlanningGenerationError extends Error {
  constructor(
    readonly code:
      | "AI_QUOTA_EXHAUSTED"
      | "AI_OUTLINE_INVALID"
      | "AI_DAY_INVALID",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function isWorkersAiQuota(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: string | number; message?: string };
  return (
    String(value.code) === "4006" ||
    String(value.code) === "3036" ||
    /^(?:AiError:\s*)?(?:4006|3036):/i.test(value.message ?? "")
  );
}
