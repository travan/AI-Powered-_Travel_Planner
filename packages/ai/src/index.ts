export { destinationContext } from "./destination-context.js";
export { parseFallbackSources } from "../fallback-config.mjs";
export type { FallbackSource } from "../fallback-config.mjs";
export { createSupplementProvider, supplementConfig } from "./supplement.js";
export type {
  SupplementProvider,
  SupplementConfig,
  SupplementProviderName,
  SupplementResponse,
} from "./supplement.js";
export { PlanningGenerationError } from "./providers/planning-generation-error.js";
export { prepareDailySlots } from "./providers/daily-plan.js";
export type { AIProvider, PreFetchedCityData } from "./provider.js";
export { OpenAIProvider } from "./providers/openai.js";
export { GeminiProvider } from "./providers/gemini.js";
export { ClaudeProvider } from "./providers/claude.js";
export { MockAIProvider } from "./providers/mock.js";
export { OllamaProvider } from "./providers/ollama.js";
export type { OllamaProviderOptions } from "./providers/ollama.js";
export {
  normalizeItinerary,
  normalizeItinerary as normalizeOllamaItinerary,
} from "./normalize-itinerary.js";

import type { AIProvider } from "./provider.js";
export type AIProviderName =
  | "openai"
  | "gemini"
  | "claude"
  | "ollama"
  | "cloudflare";
import {
  CloudflareAIProvider,
  type WorkersAIBinding,
} from "./providers/cloudflare.js";
export { CloudflareAIProvider } from "./providers/cloudflare.js";
import { OpenAIProvider } from "./providers/openai.js";
import { GeminiProvider } from "./providers/gemini.js";
import { ClaudeProvider } from "./providers/claude.js";
import { MockAIProvider } from "./providers/mock.js";
import { OllamaProvider } from "./providers/ollama.js";

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes("placeholder") ||
    normalized === "sk-..."
  );
}

function resolveKey(envVar: string, isDev: boolean): string | null {
  const key = process.env[envVar];
  if (!isPlaceholder(key)) return key as string;
  if (isDev) return null;
  throw new Error(`${envVar} is not set`);
}

function configuredModel(envVar: string, isDev: boolean): string | undefined {
  const model = process.env[envVar]?.trim();
  if (!model && !isDev) throw new Error(`${envVar} is not set`);
  return model;
}

export function createAIProvider(
  provider: AIProviderName = "openai",
  options: { workersAI?: WorkersAIBinding } = {},
): AIProvider {
  const isDev = process.env["NODE_ENV"] !== "production";

  switch (provider) {
    case "cloudflare":
      if (!options.workersAI)
        throw new Error("Cloudflare AI binding is required");
      return new CloudflareAIProvider(
        options.workersAI,
        process.env.CLOUDFLARE_AI_MODEL,
      );
    case "openai": {
      const key = resolveKey("OPENAI_API_KEY", isDev);
      return key === null
        ? new MockAIProvider()
        : new OpenAIProvider(key, configuredModel("OPENAI_MODEL", isDev));
    }
    case "gemini": {
      const key = resolveKey("GEMINI_API_KEY", isDev);
      return key === null
        ? new MockAIProvider()
        : new GeminiProvider(key, configuredModel("GEMINI_MODEL", isDev));
    }
    case "claude": {
      const key = resolveKey("ANTHROPIC_API_KEY", isDev);
      return key === null
        ? new MockAIProvider()
        : new ClaudeProvider(key, configuredModel("ANTHROPIC_MODEL", isDev));
    }
    case "ollama":
      return new OllamaProvider({
        baseURL:
          process.env["OLLAMA_BASE_URL"]?.trim() || "http://127.0.0.1:11434/v1",
        overviewModel:
          process.env["OLLAMA_OVERVIEW_MODEL"]?.trim() || "gemma4:latest",
        detailModel: process.env["OLLAMA_DETAIL_MODEL"]?.trim() || "qwen3.5:9b",
      });
    default:
      throw new Error(`Unknown AI provider: ${provider as string}`);
  }
}
