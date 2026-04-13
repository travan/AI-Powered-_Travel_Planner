export type { AIProvider, PreFetchedCityData } from "./provider.js";
export { OpenAIProvider } from "./providers/openai.js";
export { GeminiProvider } from "./providers/gemini.js";
export { ClaudeProvider } from "./providers/claude.js";
export { MockAIProvider } from "./providers/mock.js";

import type { AIProvider } from "./provider.js";
import { OpenAIProvider } from "./providers/openai.js";
import { GeminiProvider } from "./providers/gemini.js";
import { ClaudeProvider } from "./providers/claude.js";
import { MockAIProvider } from "./providers/mock.js";

export type AIProviderName = "openai" | "gemini" | "claude";

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return normalized.length === 0 || normalized.includes("placeholder") || normalized === "sk-...";
}

function resolveKey(envVar: string, isDev: boolean): string | null {
  const key = process.env[envVar];
  if (!isPlaceholder(key)) return key as string;
  if (isDev) return null;
  throw new Error(`${envVar} is not set`);
}

export function createAIProvider(
  provider: AIProviderName = "openai"
): AIProvider {
  const isDev = process.env["NODE_ENV"] !== "production";

  switch (provider) {
    case "openai": {
      const key = resolveKey("OPENAI_API_KEY", isDev);
      return key === null ? new MockAIProvider() : new OpenAIProvider(key);
    }
    case "gemini": {
      const key = resolveKey("GEMINI_API_KEY", isDev);
      return key === null ? new MockAIProvider() : new GeminiProvider(key);
    }
    case "claude": {
      const key = resolveKey("ANTHROPIC_API_KEY", isDev);
      return key === null ? new MockAIProvider() : new ClaudeProvider(key);
    }
    default:
      throw new Error(`Unknown AI provider: ${provider as string}`);
  }
}
