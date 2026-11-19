export type FallbackSource = {
  id: string;
  provider: "gemini" | "openai" | "claude";
  model: string;
  key_env: string;
};

export function parseFallbackSources(value: string | undefined, limit?: number): FallbackSource[];
