export type { AIProvider, PreFetchedCityData } from "./provider";
export { OpenAIProvider } from "./providers/openai";
export { GeminiProvider } from "./providers/gemini";
export { ClaudeProvider } from "./providers/claude";

import type { AIProvider } from "./provider";
import { OpenAIProvider } from "./providers/openai";
import { GeminiProvider } from "./providers/gemini";
import { ClaudeProvider } from "./providers/claude";

export type AIProviderName = "openai" | "gemini" | "claude";

export function createAIProvider(
  provider: AIProviderName = "openai"
): AIProvider {
  switch (provider) {
    case "openai": {
      const key = process.env["OPENAI_API_KEY"];
      if (!key) throw new Error("OPENAI_API_KEY is not set");
      return new OpenAIProvider(key);
    }
    case "gemini": {
      const key = process.env["GEMINI_API_KEY"];
      if (!key) throw new Error("GEMINI_API_KEY is not set");
      return new GeminiProvider(key);
    }
    case "claude": {
      const key = process.env["ANTHROPIC_API_KEY"];
      if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
      return new ClaudeProvider(key);
    }
    default:
      throw new Error(`Unknown AI provider: ${provider as string}`);
  }
}
