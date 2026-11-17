import { ForbiddenException, BadRequestException } from "@nestjs/common";

/** Only authenticated, explicitly allowlisted canary accounts can force a pipeline. */
export function pipelineOverride(
  userId: string,
  requested?: string,
): 1 | 2 | undefined {
  if (requested === undefined) return undefined;
  const allowed = (process.env.PLANNING_CANARY_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (!allowed.includes(userId))
    throw new ForbiddenException({ code: "PLANNING_OVERRIDE_FORBIDDEN" });
  if (requested !== "v1" && requested !== "v2")
    throw new BadRequestException({ code: "PLANNING_PIPELINE_INVALID" });
  return requested === "v2" ? 2 : 1;
}
