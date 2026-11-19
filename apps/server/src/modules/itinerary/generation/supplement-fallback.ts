import { parseFallbackSources, PlanningGenerationError, type FallbackSource, type SupplementProvider, type SupplementResponse } from "@travel/ai";
import type { AiTokenUsage } from "@travel/types";

export type { FallbackSource } from "@travel/ai";
export function fallbackAllowed(userId: string, canaryOnly: string | undefined, allowlist: string | undefined): boolean {
  return canaryOnly === "false" || (allowlist ?? "").split(",").map((value) => value.trim()).filter(Boolean).includes(userId);
}
export function simulateCanaryQuota(userId: string, env: NodeJS.ProcessEnv): boolean {
  return env.AI_FALLBACK_CANARY_FORCE_QUOTA === "true" && env.AI_FALLBACK_CANARY_ONLY === "true" &&
    fallbackAllowed(userId, "true", env.PLANNING_CANARY_USER_IDS);
}
export function fallbackSources(value: string | undefined, limit = 5): FallbackSource[] {
  try {
    return parseFallbackSources(value, limit);
  } catch {
    throw new PlanningGenerationError("AI_PROVIDER_CONFIGURATION_INVALID");
  }
}

/** Both attempts live under one durable dispatch ticket. Only a definitive
 * Cloudflare quota rejection permits a second provider; an expired ticket never does. */
export async function supplementWithFallback(options: {
  primary: SupplementProvider;
  fallbacks?: Array<{ id: string; create: () => SupplementProvider }>;
  prompt: string;
  locale: string;
  schema: Record<string, unknown>;
  signal: AbortSignal;
  onUsage: (usage: AiTokenUsage[]) => Promise<void>;
}): Promise<SupplementResponse> {
  const attempts: AiTokenUsage[] = [];
  const run = async (provider: SupplementProvider, sourceId: string) => {
    try {
      return await provider.supplementRaw(options.prompt, options.locale, options.schema);
    } finally {
      attempts.push(...provider.getUsage().map((usage) => ({ ...usage, source_id: sourceId })));
      await options.onUsage([...attempts]);
    }
  };
  let provider = options.primary;
  let sourceId = "primary";
  const remaining = [...(options.fallbacks ?? [])];
  while (true) {
    try {
      return await run(provider, sourceId);
    } catch (error) {
      if (!remaining.length || options.signal.aborted || !(error instanceof PlanningGenerationError) ||
          error.code !== "AI_QUOTA_EXHAUSTED") throw error;
      const next = remaining.shift()!;
      provider = next.create();
      sourceId = next.id;
      if (options.signal.aborted) throw error;
    }
  }
}
