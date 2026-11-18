import { PlanningGenerationError, type SupplementProvider, type SupplementResponse } from "@travel/ai";
import type { AiTokenUsage } from "@travel/types";

export type FallbackSource = { id: string; provider: "gemini" | "openai" | "claude"; model: string; key_env: string };
export function fallbackAllowed(userId: string, canaryOnly: string | undefined, allowlist: string | undefined): boolean {
  return canaryOnly !== "true" || (allowlist ?? "").split(",").map((value) => value.trim()).filter(Boolean).includes(userId);
}
export function simulateCanaryQuota(userId: string, env: NodeJS.ProcessEnv): boolean {
  return env.AI_FALLBACK_CANARY_FORCE_QUOTA === "true" && env.AI_FALLBACK_CANARY_ONLY === "true" &&
    fallbackAllowed(userId, "true", env.PLANNING_CANARY_USER_IDS);
}
export function fallbackSources(value: string | undefined): FallbackSource[] {
  if (!value?.trim()) return [];
  let sources: unknown;
  try { sources = JSON.parse(value); } catch { throw new PlanningGenerationError("AI_PROVIDER_CONFIGURATION_INVALID"); }
  if (!Array.isArray(sources) || sources.length > 5) throw new PlanningGenerationError("AI_PROVIDER_CONFIGURATION_INVALID");
  const names = new Set<string>();
  for (const item of sources) {
    const prefixes: Record<string, string> = { gemini: "GEMINI_API_KEY", openai: "OPENAI_API_KEY", claude: "ANTHROPIC_API_KEY" };
    const prefix = Object.hasOwn(prefixes, item?.provider ?? "") ? prefixes[item.provider] : undefined;
    if (!item || !prefix || typeof item.id !== "string" || item.id === "primary" || !/^[a-z0-9_-]{1,40}$/.test(item.id) || names.has(item.id) ||
        typeof item.model !== "string" || !/^[a-zA-Z0-9._:/-]{1,120}$/.test(item.model) ||
        typeof item.key_env !== "string" || !new RegExp(`^${prefix}(?:_[A-Z0-9_]{1,30})?$`).test(item.key_env))
      throw new PlanningGenerationError("AI_PROVIDER_CONFIGURATION_INVALID");
    names.add(item.id);
  }
  return sources as FallbackSource[];
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
