// Dependency-free so deployment scripts and the bundled runtime use the same rules.
const secretPrefixes = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  claude: "ANTHROPIC_API_KEY",
};

export function parseFallbackSources(value, limit = 5) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new Error("AI fallback limit must be between 1 and 20");
  if (!value?.trim()) return [];
  let sources;
  try {
    sources = JSON.parse(value);
  } catch {
    throw new Error("Invalid AI_FALLBACK_PROVIDERS JSON");
  }
  if (!Array.isArray(sources) || sources.length > limit)
    throw new Error("Invalid fallback sources");
  const names = new Set();
  for (const source of sources) {
    const prefix = typeof source?.provider === "string" && Object.hasOwn(secretPrefixes, source.provider)
      ? secretPrefixes[source.provider]
      : undefined;
    if (
      !prefix ||
      typeof source.id !== "string" ||
      source.id === "primary" ||
      !/^[a-z0-9_-]{1,40}$/.test(source.id) ||
      names.has(source.id) ||
      typeof source.model !== "string" ||
      !/^[a-zA-Z0-9._:/-]{1,120}$/.test(source.model) ||
      typeof source.key_env !== "string" ||
      !new RegExp(`^${prefix}(?:_[A-Z0-9_]{1,30})?$`).test(source.key_env)
    )
      throw new Error("Invalid fallback source");
    names.add(source.id);
  }
  return sources;
}
